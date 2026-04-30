/**
 * Orchestrator
 *
 * Central pipeline controller.
 * Pipeline: Input → (Pronoun resolve → Name normalize) → AI Planner
 *           → Decision → Supervisor → Execution → Logger
 *
 * Rules:
 * - No agent communicates with another directly
 * - Orchestrator handles ALL routing and data passing
 * - Single-action: fail-fast on any error (existing behaviour)
 * - Multi-action:  partial-success — record individual failures, continue
 */

import { makeDecision } from "./agents/decisionAgent.js";
import { validate } from "./agents/supervisorAgent.js";
import { execute } from "./agents/executionAgent.js";
import {
  validateDecisionAgent,
  validateSupervisorAgent,
  validateExecutionAgent,
  ALLOWED_ACTIONS,
} from "./utils/validators.js";
import { generatePipelineId, logPipelineSuccess, logPipelineFailure } from "./logger.js";
import { extractActions } from "./utils/aiPlanner.js";
import { normalizeInput, normalizeCommandInput } from "./utils/nameNormalizer.js";
import { resolvePronouns, resolveActionContext, updateContext } from "./context/contextStore.js";

// ── AI intent → internal pipeline intent ─────────────────────────────────────

const AI_INTENT_MAP = {
  send_message: "reply",
  send_email: "send_email",
  schedule_meeting: "schedule",
  get_tasks: "get_tasks",
  complete_task: "complete_task",
  delete_task: "delete_task",
  cancel_automation: "cancel_automation",
};

// ── Urgency detection (Objective 5) ──────────────────────────────────────────

const HIGH_URGENCY_RE = /\b(urgent|asap|immediately|critical|emergency|high priority|right now|now)\b/i;
const MEDIUM_URGENCY_RE = /\b(soon|important|priority|needed)\b/i;

function detectUrgency(text) {
  if (!text) return null;
  if (HIGH_URGENCY_RE.test(text)) return "high";
  if (MEDIUM_URGENCY_RE.test(text)) return "medium";
  return null;
}

// ── Action adapter ────────────────────────────────────────────────────────────
// Maps an AI-planner action object into the synthetic Input Agent shape that
// Decision → Supervisor → Execution expect.

function adaptAIAction(action, rawInput = "") {
  return {
    agent: "input_agent",
    intent: AI_INTENT_MAP[action.type] || "create_task",
    entities: {
      person: action.to || action.person || null,
      topic: action.body || action.title || action.filter || null,
      urgency: detectUrgency(rawInput),   // propagate urgency from original text
      deadline: action.time || null,
    },
    task: action.task || null,
    dueTime: action.dueTime || null,
    recurring: action.recurring || null,   // passed through to execution agent
    emailTo: action.to || null,   // for send_email
    emailSubject: action.subject || null,
    emailBody: action.body || null,
    confidence: 0.95,
    raw_summary: `${action.type} — ${action.to || action.person || action.task || "unknown"}`,
    status: "processed",
  };
}

// ── Single-action runner ──────────────────────────────────────────────────────

async function executeAction(syntheticInput, pipelineId, actionIndex, sharedContext = {}) {

  // Decision Agent
  let decisionAgentOutput;
  try {
    decisionAgentOutput = await makeDecision(syntheticInput);
  } catch (error) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "decision_agent_error", error: error.message, action_index: actionIndex, pipeline_stopped_at: "decision_agent", timestamp: new Date().toISOString() } };
  }

  const decisionValidation = validateDecisionAgent(decisionAgentOutput);
  if (!decisionValidation.valid) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "decision_agent_invalid_json", errors: decisionValidation.errors, action_index: actionIndex, pipeline_stopped_at: "decision_agent", timestamp: new Date().toISOString() } };
  }

  if (!ALLOWED_ACTIONS.includes(decisionAgentOutput.action)) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "rejected", reason: "invalid_action", action: decisionAgentOutput.action, action_index: actionIndex, pipeline_stopped_at: "decision_agent", timestamp: new Date().toISOString() } };
  }

  // Supervisor Agent
  let supervisorAgentOutput;
  try {
    supervisorAgentOutput = validate(decisionAgentOutput);
  } catch (error) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "supervisor_agent_error", error: error.message, action_index: actionIndex, pipeline_stopped_at: "supervisor_agent", timestamp: new Date().toISOString() } };
  }

  const supervisorValidation = validateSupervisorAgent(supervisorAgentOutput);
  if (!supervisorValidation.valid) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "supervisor_agent_invalid_json", errors: supervisorValidation.errors, action_index: actionIndex, pipeline_stopped_at: "supervisor_agent", timestamp: new Date().toISOString() } };
  }

  if (supervisorAgentOutput.approved === false) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "rejected", reason: supervisorAgentOutput.rejection_reason, rule_failed: supervisorAgentOutput.rule_failed, action_index: actionIndex, pipeline_stopped_at: "supervisor_agent", timestamp: new Date().toISOString() } };
  }

  // Execution Agent
  let executionAgentOutput;
  try {
    executionAgentOutput = await execute(supervisorAgentOutput, sharedContext);
  } catch (error) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "execution_agent_error", error: error.message, action_index: actionIndex, pipeline_stopped_at: "execution_agent", timestamp: new Date().toISOString() } };
  }

  const executionValidation = validateExecutionAgent(executionAgentOutput);
  if (!executionValidation.valid) {
    return { success: false, failure: { pipeline_id: pipelineId, status: "failed", reason: "execution_agent_invalid_json", errors: executionValidation.errors, action_index: actionIndex, pipeline_stopped_at: "execution_agent", timestamp: new Date().toISOString() } };
  }

  if (executionAgentOutput.status !== "completed") {
    return { success: false, failure: { pipeline_id: pipelineId, status: "execution_failed", reason: "execution_agent_error", action_index: actionIndex, pipeline_stopped_at: "execution_agent", timestamp: new Date().toISOString() } };
  }

  return { success: true, decision: decisionAgentOutput, supervisor: supervisorAgentOutput, execution: executionAgentOutput };
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPipeline(rawInput) {
  const pipelineId = generatePipelineId();

  // ── STEP 1 — Validate input ──────────────────────────────────────────────
  if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
    const failure = { pipeline_id: pipelineId, status: "failed", reason: "empty_input", pipeline_stopped_at: "orchestrator", timestamp: new Date().toISOString() };
    logPipelineFailure(failure);
    return { status: "failed", data: failure };
  }

  // ── STEP 2 — Pre-process input ───────────────────────────────────────────
  // 2a: Fix command-level typos/voice garbles FIRST so later steps see clean text
  //     e.g. "rechedule" → "reschedule", "shadyul" → "schedule"
  const commandFixed = normalizeCommandInput(rawInput);
  if (commandFixed !== rawInput) {
    console.log(`[orchestrator] Command normalised: "${rawInput}" → "${commandFixed}"`);
  }

  // 2b: Resolve pronouns using context memory ("message him" → "message aayush")
  const pronounResolved = resolvePronouns(commandFixed);
  if (pronounResolved !== commandFixed) {
    console.log(`[orchestrator] Pronoun resolved: "${commandFixed}" → "${pronounResolved}"`);
  }

  // 2c: Resolve action references ("reschedule it" → "reschedule meeting with rahul")
  //     Works correctly now because "rechedule" was already fixed in 2a
  const actionResolved = resolveActionContext(pronounResolved);
  if (actionResolved !== pronounResolved) {
    console.log(`[orchestrator] Action ref resolved: "${pronounResolved}" → "${actionResolved}"`);
  }

  // 2d: Normalise misspelled / voice-garbled contact names
  const normalizedInput = normalizeInput(actionResolved);
  if (normalizedInput !== actionResolved) {
    console.log(`[orchestrator] Name normalised: "${actionResolved}" → "${normalizedInput}"`);
  }

  // ── STEP 3 — Extract actions via AI planner ──────────────────────────────
  const aiOutput = await extractActions(normalizedInput);
  const actions = aiOutput.actions;

  if (actions.length === 0) {
    const failure = { pipeline_id: pipelineId, status: "failed", reason: "no_actions_extracted", pipeline_stopped_at: "ai_planner", timestamp: new Date().toISOString() };
    logPipelineFailure(failure);
    return { status: "failed", data: failure };
  }

  // ── STEP 4 — Sort by dependency (independent actions first) ─────────────
  const sorted = [...actions].sort((a, b) => {
    if (a.depends_on && !b.depends_on) return 1;
    if (!a.depends_on && b.depends_on) return -1;
    return 0;
  });

  // ── STEP 5 — Execute each action ─────────────────────────────────────────
  const actionResults = [];
  const sharedContext = {};
  const isMultiAction = sorted.length > 1;

  // If a send_message depends on a schedule_meeting, absorb its body into the
  // calendar invite description — avoids sending a duplicate bare email.
  for (const a of sorted) {
    if (a.type === "send_message" && a.depends_on) {
      sharedContext.pendingDescription = a.body;
      break;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const action = sorted[i];
    console.log(`[orchestrator] Action ${i + 1}/${sorted.length}: ${action.type}`);

    // Pass the normalised input so urgency can be extracted per-action
    const adapted = adaptAIAction(action, normalizedInput);
    const result = await executeAction(adapted, pipelineId, i, sharedContext);

    if (!result.success) {
      if (!isMultiAction) {
        logPipelineFailure(result.failure);
        return { status: result.failure.status, data: result.failure };
      }
      console.warn(`[orchestrator] Action ${i + 1} failed: ${result.failure.reason}`);
      actionResults.push({ action_index: i, action_type: action.type, status: "failed", failure: result.failure });
      continue;
    }

    // ── Update context memory after each successful action ──────────────
    const person = action.to || action.person || null;
    if (person) {
      updateContext({ lastPerson: person.toLowerCase(), lastAction: action.type, lastCommand: rawInput });
    } else {
      updateContext({ lastAction: action.type, lastCommand: rawInput });
    }

    actionResults.push({ action_index: i, action_type: action.type, status: "success", decision_agent: result.decision, supervisor_agent: result.supervisor, execution_agent: result.execution });
  }

  // ── STEP 6 — Collect results ──────────────────────────────────────────────
  const successResults = actionResults.filter(r => r.status === "success");
  const failedResults = actionResults.filter(r => r.status === "failed");

  if (successResults.length === 0) {
    const failure = { pipeline_id: pipelineId, status: "failed", reason: "all_actions_failed", action_count: sorted.length, failures: failedResults.map(r => r.failure), pipeline_stopped_at: "execution", timestamp: new Date().toISOString() };
    logPipelineFailure(failure);
    return { status: "failed", data: failure };
  }

  const fullRecord = {
    pipeline_id: pipelineId,
    actions_count: sorted.length,
    actions_executed: successResults.map(r => ({
      action_type: r.action_type,
      action: r.decision_agent.action,
      execution_id: r.execution_agent.execution_id,
      simulated_result: r.execution_agent.simulated_result,
      task_data: r.execution_agent.results?.find(res => res.task_data)?.task_data ?? null,
    })),
    actions_failed: failedResults.map(r => ({ action_type: r.action_type, reason: r.failure.reason })),
    final_status: failedResults.length > 0 ? "partial_success" : "success",
    timestamp: new Date().toISOString(),
    _agent_outputs: { ai_planner: aiOutput, action_results: actionResults },
  };

  logPipelineSuccess(fullRecord);

  // Attach explanation from the first successful action for the UI layer
  const explanation =
    successResults[0]?.execution_agent?.results?.[0]?.explanation ?? null;

  return { status: "success", data: fullRecord, explanation };
}
