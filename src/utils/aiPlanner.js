import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `
You convert user commands into structured JSON actions.

STRICT RULES:
- Output ONLY valid JSON
- NO explanation, NO text outside JSON
- Always return an object with "actions" array
- If unsure, return empty actions []

SUPPORTED ACTIONS:

1. schedule_meeting
   fields:
   - id (string)
   - type = "schedule_meeting"
   - person (string)
   - title (string)
   - time (string, optional) — copy the time phrase exactly as said, e.g. "5 pm", "tomorrow at 10 am", "next monday evening"

2. send_message
   fields:
   - id (string)
   - type = "send_message"
   - to (string)
   - body (string)
   - depends_on (optional string)

3. create_task
   fields:
   - id (string)
   - type = "create_task"
   - task (string)
   - dueTime (string, optional)
   - recurring (string, optional) — one of: "daily" | "weekdays" | "weekly:<day>"
     Use when input contains "every day", "daily", "every morning/evening", "every monday", etc.

4. get_tasks
   fields:
   - id (string)
   - type = "get_tasks"
   - filter (string, optional) — one of: "pending", "completed", "today"

5. complete_task
   fields:
   - id (string)
   - type = "complete_task"
   - task (string)

6. delete_task
   fields:
   - id (string)
   - type = "delete_task"
   - task (string)

7. send_email (direct email to an address — use when target is an explicit email address or "email" is mentioned)

8. cancel_automation (cancel the last scheduled automation)
   fields:
   - id (string)
   - type = "cancel_automation"
   Use when: "delete it", "cancel it", "stop the reminder", "cancel automation", "stop this"
   fields:
   - id (string)
   - type = "send_email"
   - to (string) — full email address
   - subject (string, optional) — infer a short subject if not provided
   - body (string) — exact message body

RULES:
- Extract all actions
- Maintain correct order
- Use lowercase for names
- Generate IDs like action_1, action_2
- If message references meeting → use depends_on
- Never invent unknown fields
- For task-related inputs like "remind me to", "add a task", extract create_task
- For create_task, extract only the core task (remove phrases like "remind me to", "add a task to")
- Normalize time phrases into clean format like "tomorrow 5 pm", "5 pm", "monday 10 am"
- Only include dueTime if the user explicitly mentions time
- Add recurring field when user says "every day", "every morning", "daily", "every monday", etc.
- recurring values: "daily" for every-day patterns, "weekdays" for Mon-Fri, "weekly:<day>" for specific days
- Do not create create_task if the task is vague or unclear
- Keep task short and concise (avoid unnecessary details)
- For inputs like "what are my tasks", "show my tasks", "list tasks" → extract get_tasks
- For "show pending tasks", "pending tasks" → get_tasks with filter: "pending"
- For "show completed tasks", "completed tasks" → get_tasks with filter: "completed"
- For "show all tasks", "all tasks", "everything" → get_tasks with filter: "all"
- For "tasks for today", "today's tasks" → get_tasks with filter: "today"
- For inputs like "mark X as done", "complete X", "finish X", "mark X done", "mark X as completed", "mark X completed" → extract complete_task with the core task name
- For inputs like "delete X", "remove X", "delete task X", "remove task X", "delete my task X", "remove my task X" → extract delete_task with the core task name

- For "delete it", "cancel it", "cancel the reminder", "stop this", "stop the automation", "cancel reminder", "remove the automation" → extract cancel_automation with no other fields
- For inputs containing the word "email" explicitly → always extract send_email
- Use send_email when: "email [name]", "send email to", "email [address]"
- Use send_message ONLY for: "message him", "tell her", "let him know", "drop a message to"
- If "email" is in the command, use send_email regardless of whether recipient is a name or address

MESSAGE BODY RULES (CRITICAL):
- Copy the message body EXACTLY as the user said it — word for word
- Do NOT shorten, summarize, truncate, or paraphrase
- Do NOT drop any words from the message
- Preserve the full sentence including grammar and tone
- Everything after "saying", "tell him", "message saying" is the body — copy it fully

EXAMPLES:

Input:
"schedule a meeting with aayush at 5 pm"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "schedule_meeting",
      "person": "aayush",
      "title": "Meeting with Aayush",
      "time": "5 pm"
    }
  ]
}

Input:
"Schedule a meeting with Aayush tomorrow at 10 am and tell him to join the meeting"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "schedule_meeting",
      "person": "aayush",
      "title": "Meeting with Aayush",
      "time": "tomorrow at 10 am"
    },
    {
      "id": "action_2",
      "type": "send_message",
      "to": "aayush",
      "body": "join the meeting",
      "depends_on": "action_1"
    }
  ]
}

Input:
"send him good morning message"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "send_message",
      "to": "unknown",
      "body": "good morning"
    }
  ]
}

Input:
"send him a message saying I hope you are feeling okay"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "send_message",
      "to": "unknown",
      "body": "I hope you are feeling okay"
    }
  ]
}
Input:
"remind me to finish report tomorrow at 5"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "finish report",
      "dueTime": "tomorrow 5 pm"
    }
  ]
}
Input:
"remind me in 1 minute"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "reminder",
      "dueTime": "in 1 minute"
    }
  ]
}
Input:
"remind me in 2 minutes"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "reminder",
      "dueTime": "in 2 minutes"
    }
  ]
}
Input:
"remind me at night"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "reminder",
      "dueTime": "night"
    }
  ]
}
Input:
"remind me in the morning"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "reminder",
      "dueTime": "morning"
    }
  ]
}
Input:
"remind me to call mom at night"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "call mom",
      "dueTime": "night"
    }
  ]
}
Input:
"remind me to study in 30 minutes"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "study",
      "dueTime": "in 30 minutes"
    }
  ]
}
Input:
"remind me to exercise today at 9 pm"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "exercise",
      "dueTime": "today 9 pm"
    }
  ]
}
Input:
"add a task to call mom"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "call mom"
    }
  ]
}
Input:
"what are my tasks"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "get_tasks"
    }
  ]
}
Input:
"show pending tasks"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "get_tasks",
      "filter": "pending"
    }
  ]
}
Input:
"mark call mom as done"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "complete_task",
      "task": "call mom"
    }
  ]
}
Input:
"delete go gym"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "delete_task",
      "task": "go gym"
    }
  ]
}
Input:
"remove my task study ai"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "delete_task",
      "task": "study ai"
    }
  ]
}

Input:
"every day at 9pm remind me to study"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "study",
      "dueTime": "9pm",
      "recurring": "daily"
    }
  ]
}

Input:
"every monday at 10am schedule standup"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "create_task",
      "task": "standup",
      "dueTime": "10am",
      "recurring": "weekly:monday"
    }
  ]
}

Input:
"send email to prachi@example.com saying we will meet tomorrow"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "send_email",
      "to": "prachi@example.com",
      "subject": "Meeting Update",
      "body": "we will meet tomorrow"
    }
  ]
}

Input:
"email john@company.com about the project deadline"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "send_email",
      "to": "john@company.com",
      "subject": "Project Deadline",
      "body": "about the project deadline"
    }
  ]
}

Input:
"Email Rahul about the report"

Output:
{
  "actions": [
    {
      "id": "action_1",
      "type": "send_email",
      "to": "rahul",
      "subject": "Report",
      "body": "about the report"
    }
  ]
}
`;

// ── Regex fallback ────────────────────────────────────────────────────────────
// Used ONLY when the LLM fails all retries. Extracts a best-effort action so
// the pipeline never returns "no_actions_extracted" for recognisable inputs.
function bestEffortFallback(input) {
  const lower = input.toLowerCase().trim();

  // Multi-action: split on "and" and process each half (max 2 actions)
  if (lower.includes(" and ")) {
    const parts = lower.split(/\s+and\s+/);
    if (parts.length === 2) {
      const first  = bestEffortFallback(parts[0].trim());
      const second = bestEffortFallback(parts[1].trim());
      const combined = [];
      if (first.actions.length  > 0) combined.push({ ...first.actions[0],  id: "action_1" });
      if (second.actions.length > 0) combined.push({ ...second.actions[0], id: "action_2" });
      if (combined.length > 0) return { actions: combined };
    }
  }

  // cancel automation
  if (/\b(cancel|delete|stop|remove)\b.{0,20}\b(it|reminder|automation|this)\b/.test(lower)) {
    return { actions: [{ id: "action_1", type: "cancel_automation" }] };
  }

  // schedule / meeting
  if (/\b(schedule|book|meeting|meet)\b/.test(lower)) {
    const m = lower.match(/\b(?:with|meet)\s+([a-z]+)/);
    return {
      actions: [{
        id: "action_1",
        type: "schedule_meeting",
        person: m?.[1] ?? "unknown",
        title: "Meeting",
        time: null,
      }],
    };
  }

  // send message / email
  if (/\b(send|email|message|tell|msg)\b/.test(lower)) {
    const toMatch   = lower.match(/\b(?:to|him|her|them|with)\s+([a-z]+)/);
    const bodyMatch = input.match(/(?:saying|tell|message|msg)[:\s]+(.+)/i);
    return {
      actions: [{
        id: "action_1",
        type: "send_message",
        to: toMatch?.[1] ?? "unknown",
        body: bodyMatch?.[1]?.trim() ?? input,
      }],
    };
  }

  // complete / done
  if (/\b(complete|done|finish|mark)\b/.test(lower)) {
    const cleaned = lower
      .replace(/\b(mark|complete|done|finish|as|task)\b/g, "")
      .trim();
    if (cleaned) {
      return { actions: [{ id: "action_1", type: "complete_task", task: cleaned }] };
    }
  }

  // delete / remove
  if (/\b(delete|remove)\b/.test(lower)) {
    const cleaned = lower.replace(/\b(delete|remove|task|my)\b/g, "").trim();
    if (cleaned) {
      return { actions: [{ id: "action_1", type: "delete_task", task: cleaned }] };
    }
  }

  // create task / remind
  if (/\b(remind|task|todo|add|create)\b/.test(lower)) {
    const cleaned = lower
      .replace(/\b(remind me to|add a task to|create a task|add task|remind me|add|create|task|todo)\b/g, "")
      .trim();
    if (cleaned) {
      // Extract time phrases into dueTime instead of leaving them in the task name
      let dueTime = null;
      let taskText = cleaned;

      // Relative time: "in 1 minute", "in 30 seconds", "in 2 hours"
      const relMatch = cleaned.match(/\b(in\s+\d+\s+(?:second|minute|hour)s?)\b/i);
      if (relMatch) {
        dueTime = relMatch[1];
        taskText = cleaned.replace(relMatch[0], "").trim();
      }

      // Period words: "at night", "morning", "evening", "at noon", "at midnight"
      if (!dueTime) {
        const periodMatch = cleaned.match(/\b(?:at\s+)?(morning|noon|afternoon|evening|night|midnight)\b/i);
        if (periodMatch) {
          dueTime = periodMatch[1];
          taskText = cleaned.replace(periodMatch[0], "").trim();
        }
      }

      // Explicit time: "at 5 pm", "5pm", "10:30 am", "tomorrow 5 pm", "tomorrow at 10 am"
      if (!dueTime) {
        const explicitMatch = cleaned.match(/\b((?:tomorrow\s+)?(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
        if (explicitMatch) {
          dueTime = explicitMatch[1];
          taskText = cleaned.replace(explicitMatch[0], "").trim();
        }
      }

      // "tomorrow" alone
      if (!dueTime && /\btomorrow\b/i.test(cleaned)) {
        dueTime = "tomorrow";
        taskText = cleaned.replace(/\btomorrow\b/i, "").trim();
      }

      // Clean up residual prepositions
      taskText = taskText.replace(/^\s*(at|to|in|on|by)\s+/i, "").trim();

      // If no task text remains after extracting time, use "reminder"
      if (!taskText) taskText = "reminder";

      const action = { id: "action_1", type: "create_task", task: taskText };
      if (dueTime) action.dueTime = dueTime;
      return { actions: [action] };
    }
  }

  // list tasks
  if (/\b(tasks|my tasks|list tasks|show tasks|what.*tasks)\b/.test(lower)) {
    return { actions: [{ id: "action_1", type: "get_tasks" }] };
  }

  return { actions: [] };
}

function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function validateActions(output) {
    if (!output || typeof output !== "object") return false;
    if (!Array.isArray(output.actions)) return false;

    for (const action of output.actions) {
        if (!action.type) return false;

        if (action.type === "schedule_meeting") {
            if (!action.person) return false;
        }
        if (action.type === "create_task") {
            if (!action.task) return false;
        }
        if (action.type === "complete_task") {
            if (!action.task) return false;
        }
        if (action.type === "delete_task") {
            if (!action.task) return false;
        }
        if (action.type === "send_message") {
            if (!action.body) return false;
        }
    }

    return true;
}

export async function extractActions(userInput) {
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                temperature: 0,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userInput },
                ],
            });

            const raw = response.choices[0].message.content.trim();

            const parsed = safeParseJSON(raw);

            if (validateActions(parsed)) {
                return parsed;
            }

            console.warn("Invalid AI output, retrying...");
        } catch (err) {
            console.error("Groq error:", err);
        }

        // small delay before retry
        await new Promise((res) => setTimeout(res, 500));
    }

    // LLM failed all retries — try regex-based best-effort extraction
    console.warn("[aiPlanner] LLM failed all retries, using best-effort fallback");
    const fallback = bestEffortFallback(userInput);
    if (fallback.actions.length > 0) {
        console.log("[aiPlanner] Fallback extracted:", fallback.actions);
        return fallback;
    }

    return { actions: [] };
}