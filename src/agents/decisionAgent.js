/**
 * Decision Agent
 * 
 * Responsibility: Determine the next action based on Input Agent output.
 * Uses rule-based mapping — no LLM calls.
 * 
 * Input:  Input Agent JSON output
 * Output: { agent, action, action_params, reason, input_confidence, status }
 */

import { ALLOWED_ACTIONS } from "../utils/validators.js";

// Intent-to-action mapping (deterministic)
const INTENT_ACTION_MAP = {
  reply:             "reply",
  send_email:        "send_email",
  schedule:          "schedule",
  create_task:       "create_task",
  get_tasks:         "get_tasks",
  complete_task:     "complete_task",
  delete_task:       "delete_task",
  escalate:          "escalate",
  cancel_automation: "cancel_automation",
  unknown:           null // Will be blocked
};

// Urgency-to-priority mapping
const URGENCY_PRIORITY_MAP = {
  high: "high",
  medium: "medium",
  low: "low"
};

// Default action messages per action type
const ACTION_MESSAGES = {
  reply: (params) => {
    const target = params.person || "sender";
    const topic = params.topic ? ` about ${truncate(params.topic, 8)}` : "";
    return truncate(`Send reply to ${target}${topic}`, 20);
  },
  schedule: (params) => {
    const target = params.person || "participants";
    const deadline = params.deadline ? ` on ${params.deadline}` : "";
    return truncate(`Schedule meeting with ${target}${deadline}`, 20);
  },
  create_task: (params) => {
    const target = params.person || "team";
    const topic = params.topic ? `: ${truncate(params.topic, 6)}` : "";
    return truncate(`Create task for ${target}${topic}`, 20);
  },
  escalate: (params) => {
    const target = params.person || "manager";
    return truncate(`Escalate issue to ${target} immediately`, 20);
  }
};

// Reason templates per action
const ACTION_REASONS = {
  reply: "Input requests response to communication",
  schedule: "Input requests scheduling a meeting or event",
  create_task: "Input requests task creation or assignment",
  get_tasks: "Input requests retrieving tasks",
  complete_task: "User requested to complete a task",
  delete_task: "Input requests task deletion",
  escalate: "Input signals urgent issue requiring escalation"
};

/**
 * Truncate text to max N words.
 */
function truncate(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

/**
 * Determine priority from Input Agent entities.
 */
function determinePriority(entities) {
  // Direct urgency mapping
  if (entities.urgency && URGENCY_PRIORITY_MAP[entities.urgency]) {
    return URGENCY_PRIORITY_MAP[entities.urgency];
  }

  // Default to medium
  return "medium";
}

/**
 * Main Decision Agent function.
 * @param {object} inputAgentOutput - The validated Input Agent output
 * @returns {object} Structured JSON output following the contract
 */
export function makeDecision(inputAgentOutput) {
  const { intent, entities, confidence } = inputAgentOutput;

  const action = INTENT_ACTION_MAP[intent];

  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return {
      agent: "decision_agent",
      action: "escalate",
      action_params: {
        target: null,
        message: "Unable to determine action from input",
        priority: "medium"
      },
      reason: "Intent could not be mapped to valid action",
      input_confidence: confidence,
      status: "blocked"
    };
  }

  // SPECIAL CASE FOR GET TASKS — must be before ACTION_MESSAGES usage
  if (action === "get_tasks") {
    const topic = (entities.topic || "").toLowerCase();
    const params = {};

    if (topic.includes("all")) params.status = "all";
    else if (topic.includes("pending")) params.status = "pending";
    else if (topic.includes("completed")) params.status = "completed";

    if (topic.includes("today")) params.time = "today";

    return {
      agent: "decision_agent",
      action,
      action_params: params,
      reason: truncate(ACTION_REASONS[action], 15),
      input_confidence: confidence,
      status: "approved_for_validation"
    };
  }

  // SPECIAL CASE FOR COMPLETE TASK
  if (action === "complete_task") {
    return {
      agent: "decision_agent",
      action,
      action_params: {
        task: inputAgentOutput.task || null
      },
      reason: "User requested to complete a task",
      input_confidence: confidence,
      status: "approved_for_validation"
    };
  }

  // SPECIAL CASE FOR DELETE TASK
  if (action === "delete_task") {
    return {
      agent: "decision_agent",
      action,
      action_params: {
        task: inputAgentOutput.task || null
      },
      reason: "Input requests task deletion",
      input_confidence: confidence,
      status: "approved_for_validation"
    };
  }

  const priority = determinePriority(entities);

  let message;

  if (action === "reply" && entities.topic) {
    let cleaned = entities.topic;
    if (cleaned.toLowerCase().includes("saying")) cleaned = cleaned.split(/saying/i).pop();
    cleaned = cleaned
      .replace(/meeting/gi, "")
      .replace(/email/gi, "")
      .replace(/send him/gi, "")
      .replace(/send/gi, "")
      .replace(/and him/gi, "")
      .replace(/about/gi, "")
      .trim();
    message = cleaned || entities.topic;
  } else {
    message = ACTION_MESSAGES[action]({
      person: entities.person,
      topic: entities.topic,
      deadline: entities.deadline
    });
  }

  // SPECIAL CASE FOR AUTOMATION CANCELLATION
  if (action === "cancel_automation") {
    return {
      agent: "decision_agent",
      action,
      action_params: {},
      reason: "User requested cancellation of the last automation",
      input_confidence: confidence,
      status: "approved_for_validation",
    };
  }

  // SPECIAL CASE FOR DIRECT EMAIL
  if (action === "send_email") {
    return {
      agent: "decision_agent",
      action,
      action_params: {
        to:      inputAgentOutput.emailTo      || entities.person || null,
        subject: inputAgentOutput.emailSubject || "Regarding your request",
        body:    inputAgentOutput.emailBody    || entities.topic  || null,
      },
      reason: "User requested sending a direct email",
      input_confidence: confidence,
      status: "approved_for_validation",
    };
  }

  // SPECIAL CASE FOR TASK
  if (action === "create_task") {
    return {
      agent: "decision_agent",
      action,
      action_params: {
        task:      inputAgentOutput.action?.task      || inputAgentOutput.task      || null,
        dueTime:   inputAgentOutput.action?.dueTime   || inputAgentOutput.dueTime   || null,
        recurring: inputAgentOutput.action?.recurring || inputAgentOutput.recurring || null,
        // Preserve urgency so high-priority tasks get correct priority in execution
        priority: (entities.urgency === "high") ? "high" : (entities.urgency === "medium") ? "medium" : "low",
      },
      reason: truncate(ACTION_REASONS[action], 15),
      input_confidence: confidence,
      status: "approved_for_validation"
    };
  }

  // DEFAULT RETURN (for all other actions)
  return {
    agent: "decision_agent",
    action,
    action_params: {
      target: entities.person || null,
      message,
      priority,
      deadline: entities.deadline || null
    },
    reason: truncate(ACTION_REASONS[action], 15),
    input_confidence: confidence,
    status: "approved_for_validation"
  };
}
