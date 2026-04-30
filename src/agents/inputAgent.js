/**
 * Input Agent
 * 
 * Responsibility: Extract structured meaning from raw input text.
 * Uses deterministic keyword matching and regex — no LLM calls.
 * 
 * Input:  raw text string
 * Output: { agent, intent, entities, confidence, raw_summary, status }
 */

// Intent keyword maps — ordered by specificity (most specific first)
const INTENT_KEYWORDS = {
  escalate: [
    "urgent", "escalate", "critical", "emergency", "immediately",
    "asap", "high priority", "blocking", "outage", "down"
  ],
  schedule: [
    "schedule", "meeting", "calendar", "book", "appointment",
    "invite", "call", "sync", "standup", "session", "friday",
    "monday", "tuesday", "wednesday", "thursday", "tomorrow"
  ],
  create_task: [
    "task", "todo", "create", "assign", "action item", "add",
    "set up", "prepare", "build", "implement", "review", "write",
    "update", "fix", "complete", "finish", "deliver"
  ],
  reply: [
    "reply", "respond", "answer", "get back", "follow up",
    "send", "email", "message", "tell", "inform", "notify",
    "acknowledge", "confirm"
  ]
};

// Urgency signal keywords
const URGENCY_SIGNALS = {
  high: ["urgent", "asap", "immediately", "critical", "emergency", "blocking", "outage", "now", "high priority"],
  medium: ["soon", "this week", "important", "priority", "needed"],
  low: ["whenever", "low priority", "no rush", "when possible", "eventually"]
};

// Common person name patterns (simple heuristic: capitalized words after trigger words)
const PERSON_TRIGGERS = [
  "to", "with", "for", "from", "tell", "assign", "email",
  "reply to", "respond to", "schedule with", "meeting with",
  "inform", "notify", "contact"
];

// Words that signal urgency but are NOT action intents themselves.
// These are modifiers — they describe HOW urgent, not WHAT to do.
const URGENCY_ONLY_WORDS = [
  "urgent", "critical", "emergency", "immediately", "asap",
  "high priority", "blocking", "outage", "now"
];

// Words that specifically mean "escalate as the action"
const ESCALATE_ACTION_WORDS = ["escalate", "escalation", "raise", "flag"];

/**
 * Extract the dominant intent from raw text using keyword matching.
 * Urgency words are treated as modifiers — they only trigger 'escalate'
 * when no stronger action intent (task, reply, schedule) is present.
 */
function extractIntent(text) {
  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    scores[intent] = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        scores[intent] += keyword.split(/\s+/).length;
      }
    }
  }

  // Check if escalate score is solely from urgency modifiers
  const hasEscalateActionWord = ESCALATE_ACTION_WORDS.some(w => lowerText.includes(w));
  const nonEscalateScore = Math.max(scores.reply || 0, scores.schedule || 0, scores.create_task || 0);

  // If escalate has points but NO explicit escalate-action word,
  // and another intent also has points, demote escalate
  if (scores.escalate > 0 && !hasEscalateActionWord && nonEscalateScore > 0) {
    scores.escalate = 0;
  }

  // Find highest scoring intent
  let bestIntent = null;
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return { intent: bestIntent, score: bestScore };
}

/**
 * Extract person entity from text using trigger-word proximity.
 * Looks for capitalized words following trigger patterns.
 */
function extractEmail(text) {
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

function extractPerson(text) {
  const invalidWords = [
    "the", "a", "an", "this", "that", "it",
    "review", "report", "budget", "meeting", "task",
    "project", "server", "issue", "update", "client",
    "team", "engineering", "bug", "fix",
    "be", "done", "him", "his", "her", "all", "send",
    "saying", "said", "quickly", "fast", "soon"
  ];

  const patterns = [
    /\b(reply to|respond to)\s+([A-Z][a-z]+)\b/i,
    /\bschedule\s+(?:a\s+)?meeting\s+with\s+([A-Z][a-z]+)\b/i,
    /\bassign\s+([A-Z][a-z]+)\b/i,
    /\bwith\s+([A-Z][a-z]+)\b/i,
    /\bfor\s+([A-Z][a-z]+)\b/i,
    /\bto\s+([A-Z][a-z]+)\b/i,
  ];

  for (let pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      const name = match[2] || match[1];

      if (!name) continue;

      const lower = name.toLowerCase();

      if (invalidWords.includes(lower)) continue;
      if (name.length < 2) continue;

      return name;
    }
  }

  return null;
}

function extractTopic(text, person) {
  let cleaned = text
    .replace(/^(please|can you|could you|i need you to|i want to)\s+/i, "")
    .replace(/\b(urgent|asap|immediately|critical)\b/gi, "")
    .trim();

  // Extract phrase after about/regarding/on/for
  const aboutMatch = cleaned.match(/(?:about|regarding|re:|on|for)\s+(.+?)(?:\.|$)/i);

  if (aboutMatch && aboutMatch[1]) {
    cleaned = aboutMatch[1].trim();
  }

  // 🔥 Remove person name
  if (person) {
    const regex = new RegExp(`\\b${person}\\b`, "gi");
    cleaned = cleaned.replace(regex, "");
  }

  // 🔥 Remove action verbs
  cleaned = cleaned.replace(
    /\b(schedule|create|reply|send|assign|tell|inform|escalate)\b/gi,
    ""
  );
  // Remove generic filler words
  cleaned = cleaned.replace(
    /\b(a|an|the|task|todo|item)\b/gi,
    ""
  );


  // 🔥 Remove connectors
  cleaned = cleaned.replace(
    /\b(to|with|for|about|on)\b/gi,
    ""
  );

  // 🔥 Remove day references
  cleaned = cleaned.replace(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    ""
  );

  // 🔥 Remove punctuation artifacts
  cleaned = cleaned.replace(/[:\-]/g, "");

  // 🔥 Final cleanup
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Remove trailing 'by'
  cleaned = cleaned.replace(/\bby\b$/i, "").trim();

  // Limit length
  return cleaned || null;
}

/**
 * Extract urgency level from text.
 */
function extractUrgency(text) {
  const lowerText = text.toLowerCase();
  for (const [level, keywords] of Object.entries(URGENCY_SIGNALS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return level;
      }
    }
  }
  return null;
}

/**
 * Extract deadline from text using date pattern matching.
 */
function extractDeadline(text) {
  // Pattern: "by <date>", "before <date>", "due <date>", "on <day>"
  const deadlinePatterns = [
    /(?:by|before|due|on|until)\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    /(?:by|before|due|until)\s+(tomorrow|today|tonight|end of (?:day|week|month))/i,
    /(?:by|before|due|until)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
    /(?:by|before|due|until)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2})/i
  ];

  for (const pattern of deadlinePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Calculate confidence score based on match quality.
 * Range: 0.0 to 1.0
 */
function calculateConfidence(intentScore, text) {
  if (intentScore === 0) return 0.10;

  const wordCount = text.split(/\s+/).length;

  // Base confidence: at least 1 keyword match in a reasonable sentence → 0.50+
  let confidence = Math.min(0.50 + (intentScore * 0.12), 1.0);

  // Boost for well-structured inputs (5-50 words)
  if (wordCount >= 5 && wordCount <= 50) confidence += 0.15;

  // Boost for clear directive language
  if (/\b(please|need|want|must|should|can you|could you)\b/i.test(text)) confidence += 0.10;

  // Slight penalty for very short inputs (less context)
  if (wordCount < 4) confidence -= 0.10;

  // Cap at 0.95 (never 100% certain with heuristics)
  return Math.round(Math.min(Math.max(confidence, 0.10), 0.95) * 100) / 100;
}

/**
 * Generate a raw summary (max 15 words).
 */
function generateSummary(intent, entities, text) {
  const parts = [];
  if (intent) parts.push(intent.replace("_", " "));
  if (entities.person) parts.push(`for ${entities.person}`);
  if (entities.topic) {
    const shortTopic = entities.topic.split(/\s+/).slice(0, 5).join(" ");
    parts.push(`about ${shortTopic}`);
  }
  if (entities.urgency === "high") parts.push("(urgent)");

  let summary = parts.join(" ");

  // Remove duplicate consecutive words
  summary = summary
    .split(/\s+/)
    .filter((word, i, arr) => i === 0 || word !== arr[i - 1])
    .join(" ");

  // Enforce 15-word max
  const words = summary.split(/\s+/);
  if (words.length > 15) {
    summary = words.slice(0, 15).join(" ");
  }

  return summary || "unclassified input";
}

/**
 * Main Input Agent function.
 * @param {string} rawInput - The raw text input to process
 * @returns {object} Structured JSON output following the contract
 */
export function processInput(rawInput) {
  if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
    return {
      agent: "input_agent",
      intent: "unknown",
      entities: {
        person: null,
        topic: null,
        urgency: null,
        deadline: null
      },
      confidence: 0.10,
      raw_summary: "empty or invalid input received",
      status: "human_review"
    };
  }

  const email = extractEmail(rawInput);

  const text = rawInput
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?]/g, "");
  const { intent, score } = extractIntent(text);
  const person = email || extractPerson(text);

  const entities = {
    person,
    email,
    topic: extractTopic(text, person),
    urgency: extractUrgency(text),
    deadline: extractDeadline(text)
  };
  const confidence = calculateConfidence(score, text);
  const finalIntent = intent || "unknown";
  const raw_summary = generateSummary(finalIntent, entities, text);
  const status = confidence >= 0.70 ? "processed" : "human_review";

  return {
    agent: "input_agent",
    intent: finalIntent,
    entities,
    confidence,
    raw_summary,
    status
  };
}
