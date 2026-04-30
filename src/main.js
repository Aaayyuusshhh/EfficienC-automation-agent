/**
 * Main Entry Point — CLI Pipeline Runner
 * 
 * Pipeline: Input → Enhancement → Decomposition → Decision → Supervisor → Execution → Logger
 * 
 * Usage: node src/main.js
 *        node src/main.js --test     (runs all test cases)
 *        node src/main.js "your input text here"
 */
process.env.RUN_MODE = "cli";
import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import { connectDB } from "./config/db.js";
import { extractActions } from "./utils/aiPlanner.js";
import { runPipeline } from "./orchestrator.js";
import config from "./config.js";

// ═══════════════════════════════════════
// Test cases — Phase 1-3 coverage
// ═══════════════════════════════════════
const TEST_CASES = [
  // ── Single-step (Phase 1 regression) ──
  {
    name: "Email Reply (single)",
    input: "Please reply to John about the project update",
    expectedStatus: "success",
    expectedActions: 1
  },
  {
    name: "Task Creation (single)",
    input: "Create a task for Sarah to review the Q4 report by Friday",
    expectedStatus: "success",
    expectedActions: 1
  },
  {
    name: "Meeting Scheduling (single)",
    input: "Schedule a meeting with David for the budget review on Thursday",
    expectedStatus: "success",
    expectedActions: 1
  },
  {
    name: "Urgent Escalation (single)",
    input: "Urgent: the production server is down, escalate to the engineering lead immediately",
    expectedStatus: "success",
    expectedActions: 1
  },
  {
    name: "Low Confidence - Gibberish",
    input: "asdfghjkl qwerty xyz",
    expectedStatus: "human_review",
    expectedActions: 0
  },
  {
    name: "Empty Input",
    input: "",
    expectedStatus: "failed",
    expectedActions: 0
  },

  // ── Multi-step (Phase 3 new) ──
  {
    name: "Multi-step: Email + Task",
    input: "Reply to John about the project update and then create a task for Sarah to review the report",
    expectedStatus: "success",
    expectedActions: 2
  },
  {
    name: "Multi-step: Schedule + Reminder",
    input: "Schedule a meeting with Alex on Friday and remind me to prepare the slides",
    expectedStatus: "success",
    expectedActions: 2
  },
  {
    name: "Multi-step: Task + Escalate",
    input: "Create a task for Mike to fix the bug and also escalate the issue to the manager",
    expectedStatus: "success",
    expectedActions: 2
  },
  {
    name: "Multi-step: Three actions",
    input: "Email Lisa about the deadline, then schedule a meeting with Tom, and create a task to prepare the report",
    expectedStatus: "success",
    expectedActions: 3
  }
];

/**
 * Print a formatted JSON result to console.
 */
function printResult(label, result) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Show decomposition and enhancement info.
 */
function showPipelineInfo(result) {
  if (!result.data) return;

  // Enhancement diff
  if (result.data._agent_outputs) {
    const input = result.data._agent_outputs.input_agent;
    const enhanced = result.data._agent_outputs.enhancement_agent;
    if (input && enhanced) {
      const diffs = [];
      if (input.entities?.topic !== enhanced.entities?.topic) {
        diffs.push(`   Topic:      "${input.entities.topic}" → "${enhanced.entities.topic}"`);
      }
      if (input.raw_summary !== enhanced.raw_summary) {
        diffs.push(`   Summary:    "${input.raw_summary}" → "${enhanced.raw_summary}"`);
      }
      if (input.confidence !== enhanced.confidence) {
        diffs.push(`   Confidence: ${input.confidence} → ${enhanced.confidence}`);
      }
      if (diffs.length > 0) {
        console.log(`   ┌─ Enhancement:`);
        diffs.forEach(d => console.log(d));
        console.log(`   └─`);
      }
    }

    // Decomposition info
    const decomp = result.data._agent_outputs.decomposition_agent;
    if (decomp) {
      console.log(`   ┌─ Decomposition: ${decomp.actions.length} action(s)`);
      decomp.actions.forEach((a, i) => {
        console.log(`   │  [${i}] ${a.action_type} → person: ${a.parameters.person || "—"}, topic: ${a.parameters.topic || "—"}`);
      });
      console.log(`   └─`);
    }
  }

  // Execution results
  if (result.data.actions_executed) {
    console.log(`   ┌─ Execution Results:`);
    result.data.actions_executed.forEach((a, i) => {
      console.log(`   │  [${i}] ${a.action_type} → ${a.execution_id}: ${a.simulated_result}`);
    });
    console.log(`   └─`);
  }
}

/**
 * Run all test cases and report results.
 */
async function runAllTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   AI OPERATIONS CO-PILOT — PHASE 3 PIPELINE TESTS     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  LLM: ${config.enable_llm ? "ENABLED" : "DISABLED (deterministic only)"}`);
  console.log(`  Confidence threshold: ${config.confidence_threshold}`);
  console.log(`  Pipeline: Input → Enhancement → Decomposition → Decision → Supervisor → Execution`);

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    const result = await runPipeline(testCase.input);
    const statusMatch = result.status === testCase.expectedStatus;

    // Check action count if applicable
    const actualActions = result.data.actions_count || 0;
    const actionMatch = testCase.expectedActions === 0 || actualActions >= testCase.expectedActions;

    const testPassed = statusMatch && actionMatch;

    if (testPassed) {
      passed++;
      console.log(`\n✅ PASS: ${testCase.name}`);
    } else {
      failed++;
      console.log(`\n❌ FAIL: ${testCase.name}`);
      if (!statusMatch) {
        console.log(`   Expected status: ${testCase.expectedStatus}, Got: ${result.status}`);
      }
      if (!actionMatch) {
        console.log(`   Expected actions: ${testCase.expectedActions}, Got: ${actualActions}`);
      }
    }

    console.log(`   Status: ${result.status} | Actions: ${actualActions || "—"}`);
    if (result.data.pipeline_stopped_at) {
      console.log(`   Stopped at: ${result.data.pipeline_stopped_at}`);
      console.log(`   Reason: ${result.data.reason}`);
    }

    showPipelineInfo(result);
    printResult(`Full Output: ${testCase.name}`, result);
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  TEST SUMMARY`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Total:  ${TEST_CASES.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Rate:   ${((passed / TEST_CASES.length) * 100).toFixed(0)}%`);
  console.log(`${"═".repeat(60)}\n`);

  return failed === 0;
}

/**
 * Run a single input from command line arguments.
 */
export async function runSingleInput(input) {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   AI OPERATIONS CO-PILOT — SINGLE PIPELINE RUN        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  LLM: ${config.enable_llm ? "ENABLED" : "DISABLED (deterministic only)"}`);
  console.log(`\nInput: "${input}"\n`);

  const result = await runPipeline(input);
  showPipelineInfo(result);
  printResult("Pipeline Result", result);
  setTimeout(() => process.exit(0), 50);
}

// ═══════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════

async function startApp() {
  await connectDB();

  console.log("System initialized");

  const args = process.argv.slice(2);

  // 👉 SPECIAL FLAG FOR AI TEST
  if (args[0] === "--ai-test") {
    const input =
      args.slice(1).join(" ") ||
      "schedule a meeting with aayush and send him a message saying do your work fast";

    const result = await extractActions(input);

    console.log("\n🧠 AI OUTPUT:");
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
  }

  // 👉 NORMAL FLOW
  else if (args.length === 0 || args[0] === "--test") {
    const allPassed = await runAllTests();
    process.exit(allPassed ? 0 : 1);
  } else {
    await runSingleInput(args.join(" "));
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase()) {
  startApp();
}