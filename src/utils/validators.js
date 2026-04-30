/**
 * validators.js
 * JSON schema validators for each agent's output.
 * Ensures strict contract enforcement at every pipeline step.
 */

const ALLOWED_ACTIONS = ["reply", "schedule", "create_task", "get_tasks", "complete_task", "delete_task", "escalate", "send_email", "cancel_automation"];
const ALLOWED_PRIORITIES = ["high", "medium", "low"];
const ALLOWED_URGENCIES = ["high", "medium", "low", null];
const ALLOWED_STATUSES_INPUT = ["processed", "human_review"];
const ALLOWED_STATUSES_DECISION = ["approved_for_validation", "blocked"];
const ALLOWED_STATUSES_EXECUTION = ["completed", "failed"];

/**
 * Validate Input Agent output against its strict JSON contract.
 * @param {object} output - The Input Agent's output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInputAgent(output) {
  const errors = [];

  if (typeof output !== "object" || output === null) {
    return { valid: false, errors: ["Output must be a JSON object"] };
  }

  // Required fields
  if (output.agent !== "input_agent") {
    errors.push(`agent must be "input_agent", got "${output.agent}"`);
  }
  if (typeof output.intent !== "string" || output.intent.length === 0) {
    errors.push("intent must be a non-empty string");
  }
  if (typeof output.entities !== "object" || output.entities === null) {
    errors.push("entities must be an object");
  } else {
    // Validate entity sub-fields exist
    if (!("person" in output.entities)) errors.push("entities.person is required");
    if (!("topic" in output.entities)) errors.push("entities.topic is required");
    if (!("urgency" in output.entities)) errors.push("entities.urgency is required");
    if (!("deadline" in output.entities)) errors.push("entities.deadline is required");
    if (output.entities.urgency !== null && !ALLOWED_URGENCIES.includes(output.entities.urgency)) {
      errors.push(`entities.urgency must be one of ${JSON.stringify(ALLOWED_URGENCIES)}`);
    }
  }
  if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) {
    errors.push("confidence must be a number between 0.0 and 1.0");
  }
  if (typeof output.raw_summary !== "string" || output.raw_summary.length === 0) {
    errors.push("raw_summary must be a non-empty string");
  } else if (output.raw_summary.split(/\s+/).length > 15) {
    errors.push("raw_summary must be max 15 words");
  }
  if (!ALLOWED_STATUSES_INPUT.includes(output.status)) {
    errors.push(`status must be one of ${JSON.stringify(ALLOWED_STATUSES_INPUT)}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Decision Agent output against its strict JSON contract.
 * @param {object} output - The Decision Agent's output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDecisionAgent(output) {
  const errors = [];

  if (typeof output !== "object" || output === null) {
    return { valid: false, errors: ["Output must be a JSON object"] };
  }

  if (output.agent !== "decision_agent") {
    errors.push(`agent must be "decision_agent", got "${output.agent}"`);
  }
  if (typeof output.action !== "string" || !ALLOWED_ACTIONS.includes(output.action)) {
    errors.push(`action must be one of ${JSON.stringify(ALLOWED_ACTIONS)}, got "${output.action}"`);
  }
  if (typeof output.action_params !== "object" || output.action_params === null) {
    errors.push("action_params must be an object");
  } else {
    if (output.action === "get_tasks") {
      // no required params
    } else if (output.action === "create_task" || output.action === "complete_task" || output.action === "delete_task") {
      if (!output.action_params.task) {
        errors.push("action_params.task is required");
      }
    } else if (output.action === "send_email") {
      if (!output.action_params.to) {
        errors.push("action_params.to is required for send_email");
      }
    } else {
      if (!output.action_params.target) {
        errors.push("action_params.target is required");
      }
      if (!output.action_params.message || typeof output.action_params.message !== "string") {
        errors.push("action_params.message must be a non-empty string");
      }
      if (!["high", "medium", "low"].includes(output.action_params.priority)) {
        errors.push('action_params.priority must be one of ["high","medium","low"]');
      }
    }
  }
  if (typeof output.reason !== "string" || output.reason.length === 0) {
    errors.push("reason must be a non-empty string");
  } else if (output.reason.split(/\s+/).length > 15) {
    errors.push("reason must be max 15 words");
  }
  if (typeof output.input_confidence !== "number") {
    errors.push("input_confidence must be a number");
  }
  if (!ALLOWED_STATUSES_DECISION.includes(output.status)) {
    errors.push(`status must be one of ${JSON.stringify(ALLOWED_STATUSES_DECISION)}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Supervisor Agent output against its strict JSON contract.
 * @param {object} output - The Supervisor Agent's output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSupervisorAgent(output) {
  const errors = [];

  if (typeof output !== "object" || output === null) {
    return { valid: false, errors: ["Output must be a JSON object"] };
  }

  if (output.agent !== "supervisor_agent") {
    errors.push(`agent must be "supervisor_agent", got "${output.agent}"`);
  }
  if (typeof output.approved !== "boolean") {
    errors.push("approved must be a boolean");
  }
  if (!("rule_failed" in output)) {
    errors.push("rule_failed is required (string or null)");
  }
  if (!("rejection_reason" in output)) {
    errors.push("rejection_reason is required (string or null)");
  }
  if (output.approved === false) {
    if (typeof output.rejection_reason !== "string" || output.rejection_reason.length === 0) {
      errors.push("rejection_reason must be a non-empty string when approved is false");
    }
  }
  if (typeof output.validated_action !== "object" || output.validated_action === null) {
    errors.push("validated_action must be an object");
  } else {
    if (!ALLOWED_ACTIONS.includes(output.validated_action.action)) {
      errors.push(`validated_action.action must be one of ${JSON.stringify(ALLOWED_ACTIONS)}`);
    }
    if (typeof output.validated_action.action_params !== "object") {
      errors.push("validated_action.action_params must be an object");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Execution Agent output against its strict JSON contract.
 * @param {object} output - The Execution Agent's output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExecutionAgent(output) {
  const errors = [];

  if (typeof output !== "object" || output === null) {
    return { valid: false, errors: ["Output must be a JSON object"] };
  }

  if (output.agent !== "execution_agent") {
    errors.push(`agent must be "execution_agent", got "${output.agent}"`);
  }
  // Execution ID format: EX-YYYYMMDD-NNN
  if (typeof output.execution_id !== "string" || !/^EX-\d{8}-\d{3}$/.test(output.execution_id)) {
    errors.push('execution_id must match format "EX-YYYYMMDD-NNN"');
  }
  if (typeof output.action_executed !== "string" || output.action_executed.length === 0) {
    errors.push("action_executed must be a non-empty string");
  }
  if (typeof output.params_used !== "object" || output.params_used === null) {
    errors.push("params_used must be an object");
  }
  if (typeof output.simulated_result !== "string" || output.simulated_result.length === 0) {
    errors.push("simulated_result must be a non-empty string");
  }
  if (!ALLOWED_STATUSES_EXECUTION.includes(output.status)) {
    errors.push(`status must be one of ${JSON.stringify(ALLOWED_STATUSES_EXECUTION)}`);
  }
  // ISO 8601 timestamp check
  if (typeof output.timestamp !== "string" || isNaN(Date.parse(output.timestamp))) {
    errors.push("timestamp must be a valid ISO 8601 string");
  }

  return { valid: errors.length === 0, errors };
}

const DECOMPOSITION_ACTIONS = ["schedule", "send_email", "create_task", "set_reminder", "escalate"];
const ALLOWED_STATUSES_DECOMPOSITION = ["decomposed"];

/**
 * Validate Decomposition Agent output against its strict JSON contract.
 * @param {object} output - The Decomposition Agent's output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDecompositionAgent(output) {
  const errors = [];

  if (typeof output !== "object" || output === null) {
    return { valid: false, errors: ["Output must be a JSON object"] };
  }

  if (output.agent !== "decomposition_agent") {
    errors.push(`agent must be "decomposition_agent", got "${output.agent}"`);
  }

  // Validate actions array
  if (!Array.isArray(output.actions)) {
    errors.push("actions must be an array");
  } else if (output.actions.length === 0) {
    errors.push("actions must contain at least one action");
  } else {
    for (let i = 0; i < output.actions.length; i++) {
      const action = output.actions[i];
      if (typeof action !== "object" || action === null) {
        errors.push(`actions[${i}] must be an object`);
        continue;
      }
      if (!DECOMPOSITION_ACTIONS.includes(action.action_type)) {
        errors.push(`actions[${i}].action_type must be one of ${JSON.stringify(DECOMPOSITION_ACTIONS)}, got "${action.action_type}"`);
      }
      if (typeof action.parameters !== "object" || action.parameters === null) {
        errors.push(`actions[${i}].parameters must be an object`);
      } else {
        if (!("person" in action.parameters)) errors.push(`actions[${i}].parameters.person is required`);
        if (!("topic" in action.parameters)) errors.push(`actions[${i}].parameters.topic is required`);
        if (!("deadline" in action.parameters)) errors.push(`actions[${i}].parameters.deadline is required`);
      }
    }
  }

  if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) {
    errors.push("confidence must be a number between 0.0 and 1.0");
  }
  if (!ALLOWED_STATUSES_DECOMPOSITION.includes(output.status)) {
    errors.push(`status must be one of ${JSON.stringify(ALLOWED_STATUSES_DECOMPOSITION)}`);
  }

  return { valid: errors.length === 0, errors };
}

export { ALLOWED_ACTIONS, ALLOWED_PRIORITIES, DECOMPOSITION_ACTIONS };
