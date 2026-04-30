# System Architecture

## 1. Overview

The system is a controlled multi-agent pipeline where each agent performs a specific role.

No agent operates independently or loops.

---

## 2. Pipeline Flow

Input → Input Agent → Decision Agent → Supervisor Agent → Execution Agent → Logging

---

## 3. Agent Responsibilities

### Input Agent

* Extract structured meaning from raw input

### Decision Agent

* Determine next action

### Supervisor Agent

* Validate decision before execution

### Execution Agent

* Perform action

---

## 4. System Rules

* No direct execution from LLM
* No skipping validation
* No free-form outputs
* All communication via JSON

---

## 5. Data Flow Contract

Each agent must:

* receive structured input
* return structured output
* pass output to next agent

---

## 6. Failure Handling

If:

* decision invalid → stop workflow
* missing data → request fallback
* unsafe action → reject execution
