# Tech Stack

## 1. Overview

This project follows a **layered architecture** where each layer has a clear responsibility.
The system is designed to be **modular, low-cost, and scalable**, while avoiding unnecessary complexity.

---

## 2. Core AI Layer

### Primary Model

* Claude (via API or Antigravity integration)
* Used for:

  * intent understanding
  * decision making
  * reasoning

### Secondary / Optional Models

* Gemini API (free tier)
* Gemma (local or hosted)

Used for:

* lightweight tasks (classification, summaries)
* fallback when needed

---

## 3. Agent Orchestration Layer

* Antigravity (Agent Manager + Workflows)

Responsibilities:

* define agents
* control workflow execution
* pass structured data between agents
* enforce sequencing (no loops)

---

## 4. Backend Layer (Phase 2 / Optional Initially)

* FastAPI (Python)

Responsibilities:

* routing logic
* rule-based validation
* API integrations
* system control layer

Note:
This is not required in initial phase but recommended for scaling.

---

## 5. Automation Layer (Optional / Future)

* n8n (self-hosted)

Responsibilities:

* external triggers (email, webhook)
* scheduling
* third-party integrations

---

## 6. Data & Memory Layer

### Phase 1 (Current)

* In-memory storage (logs within system)

### Phase 2

* PostgreSQL (structured data)
* Chroma DB (vector storage for context)

---

## 7. Execution Layer

* Internal execution (simulation in Phase 1)
* API-based execution (Phase 2)

Examples:

* send email
* create task
* trigger workflow

---

## 8. Frontend Layer (Optional but Recommended)

* React (or simple UI)

Displays:

* workflow execution
* agent outputs
* logs and decisions

---

## 9. Development Phases

### Phase 1 (Current Focus)

* Antigravity + Claude
* Multi-agent workflows
* Simulated execution
* No external APIs

### Phase 2

* Add FastAPI backend
* Integrate real APIs (Gmail, Slack)
* Add persistent database

### Phase 3

* UI dashboard
* optimization and scaling

---

## 10. Key Design Principles

* Minimal LLM usage (only where needed)
* Strict JSON outputs between agents
* Clear separation of responsibilities
* Validation before execution
* No dependency on a single model
* Modular and extensible architecture

---

## 11. Constraints

* System must function without paid APIs
* No uncontrolled agent loops
* No execution directly from LLM
* Maintain predictable and testable workflows
