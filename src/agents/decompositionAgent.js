/**
 * Decomposition Agent
 * 
 * Position: AFTER Enhancement Agent, BEFORE Decision Agent
 * 
 * Responsibility: Detect multi-step intent in a single input and break it
 * into ordered, executable actions.
 * 
 * Rules:
 * - Single-step inputs produce a single-action list (pass-through)
 * - Multi-step inputs produce ordered action list
 * - Deterministic-first, optional LLM for complex decomposition
 * - No hallucinated entities — only uses what Input Agent extracted
 * - No retries, no loops
 * 
 * Input:  Enhanced Input Agent JSON
 * Output: { agent, actions[], confidence, status }
 */

import config from "../config.js";
import { decomposeWithLLM } from "../utils/llmWrapper.js";

// ═══════════════════════════════════════
// Decomposition action types
// ═══════════════════════════════════════
const DECOMPOSITION_ACTIONS = ["schedule", "send_email", "create_task", "set_reminder", "escalate"];

// Map Input Agent intents to decomposition action types
const INTENT_TO_ACTION = {
  reply: "send_email",
  schedule: "schedule",
  create_task: "create_task",
  escalate: "escalate"
};

// ═══════════════════════════════════════
// Multi-step detection patterns
// ═══════════════════════════════════════

// Conjunctions and sequencing signals that indicate multiple steps
const MULTI_STEP_SIGNALS = [
  /\band\s+\w+/i,
  /\bthen\b/i,
  /\bafter\s+that\b/i,
  /\balso\b/i,
  /\bplus\b/i,
  /\badditionally\b/i,
  /\bas\s+well\b/i,
  /\bfirst\b.*\bthen\b/i,
  /\bremind\s+me\b/i,
  /\bset\s+(?:a\s+)?reminder\b/i,
  /\bfollow\s*up\b/i,
  /\bdon'?t\s+forget\b/i
];

// Action-specific keyword groups for decomposition
const ACTION_KEYWORDS = {
  schedule: [
    "schedule", "meeting", "calendar", "book", "appointment",
    "invite", "call", "sync", "standup"
  ],
  send_email: [
    "reply", "respond", "email", "send", "message",
    "tell", "inform", "notify", "get back"
  ],
  create_task: [
    "task", "todo", "assign", "create", "action item",
    "prepare", "build", "implement", "review", "write",
    "update", "fix", "complete", "deliver"
  ],
  set_reminder: [
    "remind", "reminder", "follow up", "follow-up",
    "don't forget", "check back", "ping me"
  ],
  escalate: [
    "escalate", "escalation", "raise", "flag"
  ]
};

// Person extraction patterns per clause
const CLAUSE_PERSON_PATTERN = /(?:to|with|for|from|assign)\s+([A-Z][a-z]+)/;

// Topic extraction per clause
const CLAUSE_TOPIC_PATTERNS = [
  /(?:about|regarding|on|for)\s+(.+?)(?:\s+(?:and|then|also|,)|$)/i,
  /(?:to\s+\w+\s+)(.+?)(?:\s+(?:and|then|also|,)|$)/i
];

/**
 * Detect if input contains multiple steps.
 * Returns true if multi-step signals are found.
 */
function isMultiStep(text) {
  return MULTI_STEP_SIGNALS.some(pattern => pattern.test(text));
}

/**
 * Split text into clauses based on conjunctions and punctuation.
 */
function splitIntoClauses(text) {
  const verbPattern = /\b(schedule|reply|send|create|assign|remind|email|escalate|book|set|review|fix|tell|inform|prepare|meet)\b/i;

  // Strategy 1: Split on explicit sequencing conjunctions
  let clauses = text
    .split(/\s*(?:,\s*and\s+then|,\s*and\s+also|,\s*and\s+|,?\s*and\s+then|\s+then\s+|\s+also\s+|;\s+|\s+plus\s+|\s+additionally\s+)/i)
    .map(c => c.trim())
    .filter(c => c.length > 2);

  if (clauses.length > 1) {
    // Further split any clause that still contains multiple action verbs
    const expanded = [];
    for (const clause of clauses) {
      const andParts = clause.split(/\s+and\s+/i);
      if (andParts.length > 1 && andParts.every(p => verbPattern.test(p))) {
        expanded.push(...andParts.map(p => p.trim()).filter(p => p.length > 2));
      } else {
        expanded.push(clause);
      }
    }
    return expanded.filter(c => c.length > 2);
  }

  // Strategy 2: Split on "and" if both halves have action verbs
  const andSplit = text.split(/\s+and\s+/i);
  if (andSplit.length > 1) {
    const allHaveVerbs = andSplit.every(c => verbPattern.test(c));
    if (allHaveVerbs) {
      clauses = andSplit.map(c => c.trim()).filter(c => c.length > 2);
      if (clauses.length > 1) return clauses;
    }
  }

  // Strategy 3: Split on commas where the next segment starts with an action verb
  const commaParts = text.split(/,\s*/);
  if (commaParts.length > 1) {
    const merged = [];
    let buffer = commaParts[0];

    for (let i = 1; i < commaParts.length; i++) {
      const part = commaParts[i].replace(/^(and|then|also)\s+/i, "").trim();
      if (verbPattern.test(part)) {
        merged.push(buffer.trim());
        buffer = part;
      } else {
        buffer += ", " + commaParts[i];
      }
    }
    merged.push(buffer.trim());

    clauses = merged.filter(c => c.length > 2);
    if (clauses.length > 1) return clauses;
  }

  return clauses;
}

/**
 * Determine the action type for a clause based on keyword matching.
 */
function classifyClause(clause) {
  const lower = clause.toLowerCase();
  let bestAction = null;
  let bestScore = 0;

  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        score += keyword.split(/\s+/).length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

/**
 * Extract a person name from a clause.
 */
function extractClausePerson(clause) {
  const match = clause.match(CLAUSE_PERSON_PATTERN);
  if (match && match[1]) {
    const invalidWords = [
      "the", "a", "an", "this", "that", "it",
      "review", "report", "budget", "meeting", "task",
      "project", "server", "issue", "update", "client",
      "team", "engineering", "bug", "fix", "Monday",
      "Tuesday", "Wednesday", "Thursday", "Friday"
    ];
    if (!invalidWords.includes(match[1])) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract a topic from a clause.
 */
function extractClauseTopic(clause) {
  for (const pattern of CLAUSE_TOPIC_PATTERNS) {
    const match = clause.match(pattern);
    if (match && match[1]) {
      let topic = match[1].trim();
      // Clean up
      topic = topic.replace(/\b(please|urgent|asap|kindly)\b/gi, "").trim();
      topic = topic.replace(/\s+/g, " ").trim();
      if (topic.length >= 2) return topic.substring(0, 50);
    }
  }
  return null;
}

/**
 * Extract a deadline from a clause.
 */
function extractClauseDeadline(clause) {
  const patterns = [
    /(?:by|before|due|on|until)\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    /(?:by|before|due|until)\s+(tomorrow|today|tonight|end of (?:day|week|month))/i,
    /(?:by|before|due|until)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
  ];
  for (const pattern of patterns) {
    const match = clause.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

/**
 * Decompose a single-step input into one action.
 * Uses the enhanced Input Agent data directly.
 */
function decomposeSingleStep(enhancedInput) {
  const actionType = INTENT_TO_ACTION[enhancedInput.intent] || "create_task";

  return {
    agent: "decomposition_agent",
    actions: [
      {
        action_type: actionType,
        parameters: {
          person: enhancedInput.entities.person || null,
          topic: enhancedInput.entities.topic || null,
          deadline: enhancedInput.entities.deadline || null
        }
      }
    ],
    confidence: enhancedInput.confidence,
    status: "decomposed"
  };
}

/**
 * Decompose a multi-step input into ordered actions using rule-based parsing.
 */
function decomposeMultiStep(enhancedInput, rawText) {
  const clauses = splitIntoClauses(rawText);
  const actions = [];

  for (const clause of clauses) {
    const actionType = classifyClause(clause);
    if (!actionType) continue;

    actions.push({
      action_type: actionType,
      parameters: {
        person: extractClausePerson(clause) || enhancedInput.entities.person || null,
        topic: extractClauseTopic(clause) || enhancedInput.entities.topic || null,
        deadline: extractClauseDeadline(clause) || enhancedInput.entities.deadline || null
      }
    });
  }

  // If clause parsing produced no valid actions, fall back to single-step
  if (actions.length === 0) {
    return decomposeSingleStep(enhancedInput);
  }

  // Check for implicit reminder — if "remind" or "follow up" appears anywhere
  const lower = rawText.toLowerCase();
  const hasReminder = /\bremind\b|\bfollow\s*up\b|\bdon'?t\s+forget\b/i.test(lower);
  const alreadyHasReminder = actions.some(a => a.action_type === "set_reminder");

  if (hasReminder && !alreadyHasReminder) {
    actions.push({
      action_type: "set_reminder",
      parameters: {
        person: enhancedInput.entities.person || null,
        topic: actions[0]?.parameters?.topic || enhancedInput.entities.topic || null,
        deadline: enhancedInput.entities.deadline || null
      }
    });
  }

  // Slight confidence penalty for multi-step (more uncertainty)
  const adjustedConfidence = Math.round(
    Math.max(enhancedInput.confidence - (actions.length * 0.02), 0.50) * 100
  ) / 100;

  return {
    agent: "decomposition_agent",
    actions,
    confidence: adjustedConfidence,
    status: "decomposed"
  };
}

/**
 * Main Decomposition Agent function.
 * 
 * @param {object} enhancedInput - Enhanced Input Agent JSON
 * @param {string} rawText - Original raw input text (for clause splitting)
 * @returns {Promise<object>} Decomposition result
 */
export async function decompose(enhancedInput, rawText) {
  const text = rawText || "";

  // Detect if multi-step
  const multiStep = isMultiStep(text);

  if (!multiStep) {
    // Single-step: direct pass-through
    return decomposeSingleStep(enhancedInput);
  }

  // Multi-step: try rule-based decomposition first
  let result = decomposeMultiStep(enhancedInput, text);

  // Optional LLM decomposition for complex multi-step inputs
  if (config.enable_llm) {
    try {
      const llmResult = await decomposeWithLLM(text, enhancedInput);

      if (
        llmResult &&
        Array.isArray(llmResult.actions) &&
        llmResult.actions.length > result.actions.length &&
        llmResult.actions.every(a => DECOMPOSITION_ACTIONS.includes(a.action_type))
      ) {
        result = {
          agent: "decomposition_agent",
          actions: llmResult.actions,
          confidence: Math.min(llmResult.confidence || 0.75, 0.90),
          status: "decomposed"
        };
      }
    } catch {
      // fallback remains
    }
  }

  return result;
}

export { DECOMPOSITION_ACTIONS };
