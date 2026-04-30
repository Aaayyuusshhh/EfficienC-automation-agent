# AI Operations Co-Pilot — Phase 1 Walkthrough

## What Was Built

A complete 4-agent pipeline with orchestrator, strict JSON contracts, and filesystem logging — **no backend, no UI, no LLM dependencies**.

### Files Created

| File | Purpose |
|------|---------|
| [package.json](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/package.json) | ES module Node.js project, zero dependencies |
| [inputAgent.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/agents/inputAgent.js) | Keyword-based intent classification + regex entity extraction |
| [decisionAgent.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/agents/decisionAgent.js) | Intent→action mapping with priority derivation |
| [supervisorAgent.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/agents/supervisorAgent.js) | 5-rule validation pipeline (whitelist, fields, priority, safety, status) |
| [executionAgent.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/agents/executionAgent.js) | Simulated execution with unique EX-YYYYMMDD-NNN IDs |
| [orchestrator.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/orchestrator.js) | 11-step pipeline controller with fail-fast at every step |
| [validators.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/utils/validators.js) | JSON schema validators for all 4 agent contracts |
| [logger.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/logger.js) | Filesystem JSON logging under `logs/` |
| [main.js](file:///c:/Users/AAYUSH%20KATYAL/Downloads/aayush%20vscode/Automation%20Agent/src/main.js) | CLI entry with 8 test cases |

---

## Pipeline Flow

```
Raw Text → Input Agent → Decision Agent → Supervisor Agent → Execution Agent → Logger
              ↓               ↓                 ↓                  ↓
         confidence < 0.70?  invalid action?   approved=false?   status≠completed?
              ↓               ↓                 ↓                  ↓
            STOP             STOP              STOP               STOP
```

## Agent JSON Contracts

Each agent returns **strict JSON** — validated by schema validators at every step:

- **Input Agent**: `{ agent, intent, entities, confidence, raw_summary, status }`
- **Decision Agent**: `{ agent, action, action_params, reason, input_confidence, status }`
- **Supervisor Agent**: `{ agent, approved, rule_failed, rejection_reason, validated_action }`
- **Execution Agent**: `{ agent, execution_id, action_executed, params_used, simulated_result, status, timestamp }`

---

## Test Results

**8/8 tests pass (100%)**

| Test Case | Status | Action | Result |
|-----------|--------|--------|--------|
| Email Reply | ✅ success | reply | Reply sent to John |
| Task Creation | ✅ success | create_task | Task assigned to Sarah |
| Meeting Scheduling | ✅ success | schedule | Meeting scheduled with David |
| Urgent Escalation | ✅ success | escalate | Escalated to engineering lead |
| Low Confidence | ✅ human_review | — | Stopped at input_agent |
| Empty Input | ✅ failed | — | Stopped at orchestrator |
| Reply Medium Priority | ✅ success | reply | Reply sent to client |
| High Priority Task | ✅ success | create_task | Task assigned to Mike |

---

## Key Design Decisions

1. **Urgency as modifier, not intent**: Words like "urgent" and "critical" modify priority but don't override the primary action intent (e.g., "Urgent: create a task" → `create_task` with `high` priority, not `escalate`)
2. **Confidence threshold at 0.70**: Below this, pipeline routes to `human_review` instead of proceeding with uncertain data
3. **Zero external dependencies**: Pure Node.js — no npm packages, no LLM API calls
4. **Fail-fast pipeline**: Any JSON validation failure or rule violation stops the pipeline immediately with a descriptive `pipeline_stopped_at` indicator

## How to Run

```bash
# Run all 8 tests
node src/main.js --test

# Run a single input
node src/main.js "Reply to John about the budget report"
```
