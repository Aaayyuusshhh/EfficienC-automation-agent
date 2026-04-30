# Workflows

## Workflow 1: Email Processing

### Input

Raw email text

---

### Steps

1. Input Agent

   * classify intent
   * extract entities

2. Decision Agent

   * determine action:

     * reply
     * schedule
     * create task

3. Supervisor Agent

   * validate:

     * action correctness
     * data completeness

4. Execution Agent

   * execute:

     * send reply (simulated)
     * create task (DB/log)

---

### Output

Structured result of execution

---

## Workflow Rules

* Every step must complete before next
* No skipping validation
* Stop workflow on rejection
