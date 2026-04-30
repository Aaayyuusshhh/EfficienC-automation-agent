/**
 * Supervisor Agent
 * 
 * Responsibility: Validate the Decision Agent's output before execution.
 * Pure rule-based validation — no LLM calls.
 * 
 * Input:  Decision Agent JSON output
 * Output: { agent, approved, rule_failed, rejection_reason, validated_action }
 */

import { ALLOWED_ACTIONS, ALLOWED_PRIORITIES } from "../utils/validators.js";

// Unsafe patterns that should never appear in action parameters
const UNSAFE_PATTERNS = [
  /\bdrop\s+table\b/i,
  /\bdelete\s+all\b/i,
  /\brm\s+-rf\b/i,
  /\bformat\s+c:/i,
  /\bshutdown\b/i,
  /\b(exec|eval|system)\s*\(/i,
  /<script\b/i,
  /javascript:/i
];

/**
 * Validate that the action is in the allowed whitelist.
 */
function validateAction(action) {
  if (!action || typeof action !== "string") {
    return { passed: false, rule: "action_exists", reason: "Action is missing or not a string" };
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    return { passed: false, rule: "action_whitelist", reason: `Action "${action}" is not in allowed actions: ${ALLOWED_ACTIONS.join(", ")}` };
  }
  return { passed: true };
}

/**
 * Validate that all required fields are present and non-empty.
 */
function validateRequiredFields(decisionOutput) {
  const requiredFields = ["agent", "action", "action_params", "reason", "input_confidence", "status"];

  for (const field of requiredFields) {
    if (!(field in decisionOutput)) {
      return { passed: false, rule: "required_fields", reason: `Missing required field: ${field}` };
    }
    if (decisionOutput[field] === undefined || decisionOutput[field] === "") {
      return { passed: false, rule: "required_fields", reason: `Field "${field}" is empty or undefined` };
    }
  }

  // Validate action_params sub-fields
  const params = decisionOutput.action_params;
  if (typeof params !== "object" || params === null) {
    return { passed: false, rule: "required_fields", reason: "action_params must be an object" };
  }
  if (decisionOutput.action === "get_tasks") {
    // no required params
  } else if (decisionOutput.action === "create_task" || decisionOutput.action === "complete_task" || decisionOutput.action === "delete_task") {
    if (!params.task) {
      return { passed: false, rule: "required_fields", reason: `action_params.task is required for ${decisionOutput.action}` };
    }
    // "later" sentinel from timeParser — ask for a specific time
    if (params.dueTime === "LATER") {
      return { passed: false, rule: "clarification_needed", reason: "When would you like to be reminded? Please specify a time." };
    }
  } else if (decisionOutput.action === "send_email") {
    // validated in validateActionSpecific below
  } else if (decisionOutput.action === "cancel_automation") {
    // no params required — uses context store for lastJobId
  } else {
    if (!("target" in params)) {
      return { passed: false, rule: "required_fields", reason: "action_params.target is required" };
    }
    if (!("message" in params) || typeof params.message !== "string") {
      return { passed: false, rule: "required_fields", reason: "action_params.message must exist" };
    }
  }

  return { passed: true };
}

/**
 * Validate that the priority is a valid value.
 */
function validatePriority(priority) {
  if (!ALLOWED_PRIORITIES.includes(priority)) {
    return { passed: false, rule: "valid_priority", reason: `Priority "${priority}" is not valid. Must be: ${ALLOWED_PRIORITIES.join(", ")}` };
  }
  return { passed: true };
}

/**
 * Validate that action parameters contain no unsafe content.
 */
function validateSafety(actionParams) {
  const textToCheck = JSON.stringify(actionParams).toLowerCase();

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return { passed: false, rule: "safety_check", reason: "Action parameters contain potentially unsafe content" };
    }
  }
  return { passed: true };
}

/**
 * Validate that the decision status is consistent.
 */
function validateStatus(decisionOutput) {
  if (decisionOutput.status === "blocked") {
    return { passed: false, rule: "status_blocked", reason: "Decision Agent marked this as blocked" };
  }
  if (decisionOutput.status !== "approved_for_validation") {
    return { passed: false, rule: "status_invalid", reason: `Unexpected status: "${decisionOutput.status}"` };
  }
  return { passed: true };
}

function validateActionSpecific(action, params) {

  // 📧 DIRECT EMAIL VALIDATION
  if (action === "send_email") {
    if (!params.to) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "Who should I send the email to? Please provide an email address."
      };
    }
    if (!params.body) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "What should the email say?"
      };
    }
  }

  // 🔴 EMAIL VALIDATION
  if (action === "reply") {
    if (!params.target) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "Who should I send this email to?"
      };
    }

    if (!params.message) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "What should the email say?"
      };
    }
  }

  // 🔴 SCHEDULING VALIDATION
  if (action === "schedule") {
    if (!params.target) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "Who should I schedule this meeting with?"
      };
    }
    if (!params.deadline) {
      return {
        passed: false,
        rule: "clarification_needed",
        reason: "What time should I schedule this meeting?"
      };
    }
  }

  return { passed: true };
}

/**
 * Main Supervisor Agent function.
 * Runs all validation rules in sequence. Stops at first failure.
 * 
 * @param {object} decisionOutput - The validated Decision Agent output
 * @returns {object} Structured JSON output following the contract
 */
export function validate(decisionOutput) {
  // Define validation pipeline (order matters)
  const validations = [
    () => validateRequiredFields(decisionOutput),
    () => validateAction(decisionOutput.action),
    () => (["create_task","get_tasks","complete_task","delete_task","send_email","cancel_automation"].includes(decisionOutput.action)) ? { passed: true } : validatePriority(decisionOutput.action_params?.priority),
    () => validateSafety(decisionOutput.action_params || {}),
    () => validateActionSpecific(decisionOutput.action, decisionOutput.action_params),
    () => validateStatus(decisionOutput)
  ];
  // Run each validation
  for (const check of validations) {
    const result = check();
    if (!result.passed) {
      return {
        agent: "supervisor_agent",
        approved: false,
        rule_failed: result.rule,
        rejection_reason: result.reason,
        validated_action: {
          action: decisionOutput.action || "unknown",
          action_params: decisionOutput.action_params || {}
        }
      };
    }
  }

  // All validations passed
  return {
    agent: "supervisor_agent",
    approved: true,
    rule_failed: null,
    rejection_reason: null,
    validated_action: {
      action: decisionOutput.action,
      action_params: { ...decisionOutput.action_params }
    }
  };
}
