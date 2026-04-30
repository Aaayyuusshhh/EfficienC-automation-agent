# Agent Definitions

## General Rules (applies to all agents)

* Output must be valid JSON
* No extra text outside JSON
* No assumptions without input
* No execution logic except Execution Agent

---

## Input Agent

Input:

* raw text

Output:
{
"intent": "",
"entities": {},
"confidence": 0.0
}

---

## Decision Agent

Input:

* structured input + context

Allowed actions:

* reply
* schedule
* create_task
* escalate

Output:
{
"action": "",
"reason": "",
"priority": ""
}

---

## Supervisor Agent

Input:

* decision output

Validation:

* action exists
* required fields present
* action is safe

Output:
{
"approved": true/false,
"reason": ""
}

---

## Execution Agent

Input:

* approved decision

Rules:

* execute only if approved = true
* simulate if no API connected

Output:
{
"status": "",
"result": ""
}
