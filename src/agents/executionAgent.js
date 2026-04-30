/**
 * Execution Agent
 * 
 * Responsibility: Execute the validated action (simulated in Phase 1).
 * Only runs if Supervisor approved = true.
 * 
 * Input:  Supervisor Agent JSON output (with validated_action)
 * Output: { agent, execution_id, action_executed, params_used, simulated_result, status, timestamp }
 */
import { updateContext } from "../context/contextStore.js";
import { formatProfessionalEmail } from "../utils/emailFormatter.js";
import resolveContact from "../tools/contactResolver.js";
import { sendEmail } from "../tools/gmailTool.js";
import { createCalendarEvent } from "../tools/calendarTool.js";
import { parseTime } from "../utils/timeParser.js";
import { generateSubjectLine } from "../utils/subjectGenerator.js";
import { createTask, getAllTasks, getTasksFiltered, completeTask, deleteTask, updateTask } from "../modules/taskManager.js";
import { handleTaskCompleted } from "../automation/automationEngine.js";
import { createLog } from "../repositories/actionLogRepository.js";
import { scheduleRecurring, scheduleOnce, buildCronExpression, cancelSchedule, cancelScheduleByLabel } from "../automation/scheduler.js";
import { createNotionTask, updateNotionTaskStatus } from "../integrations/notionService.js";
// Execution counter for generating unique IDs within a session
let executionCounter = 0;

// ── Retry wrapper — one automatic retry for transient failures ────────────────
async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[execution] "${label}" failed, retrying once…`, err.message);
    await new Promise(r => setTimeout(r, 800));
    return await fn(); // second attempt — propagates if it also fails
  }
}

// ── Explanation generator — rule-based, no LLM ────────────────────────────────
function generateExplanation(action, params) {
  switch (action) {
    case "create_task":
      if (params.recurring) return `Recurring reminder set — will trigger ${params.recurring}.`;
      if (params.dueTime) return `Task created with a scheduled reminder based on your instruction.`;
      return `Task created based on your instruction.`;
    case "complete_task": return `Task marked as done as requested.`;
    case "delete_task": return `Task removed as requested.`;
    case "send_email": return `Email sent because you asked to notify the recipient.`;
    case "reply": return `Message sent to the recipient as requested.`;
    case "schedule": return `Meeting scheduled based on your request.`;
    case "get_tasks": return `Task list retrieved based on your filter.`;
    default: return `Action completed successfully.`;
  }
}

// Simulated result messages per action type
const SIMULATED_RESULTS = {
  reply: (params) => {
    const target = params.target || "sender";
    return `Simulated: Reply sent to ${target} successfully.`;
  },
  schedule: (params) => {
    const target = params.target || "participants";
    return `Simulated: Meeting scheduled with ${target} successfully.`;
  },
  create_task: (params) => {
    const target = params.target || "team";
    return `Simulated: Task created and assigned to ${target} successfully.`;
  },
  escalate: (params) => {
    const target = params.target || "manager";
    return `Simulated: Issue escalated to ${target} with high priority.`;
  }
};

function parseDueTime(input) {
  if (!input) return null;

  const now = new Date();

  if (input.toLowerCase().includes("tomorrow")) {
    const date = new Date(now);
    date.setDate(now.getDate() + 1);

    const timeMatch = input.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3].toLowerCase();

      if (ampm === "pm" && hours !== 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
    }

    return date.toISOString();
  }

  return null;
}

function normalizeParams(action, params) {
  if (action === "reply") {
    let cleanBody = params.message || "";

    cleanBody = cleanBody
      .replace(/Send reply to .*? saying/i, "")
      .trim();

    let email = params.target;

    console.log("Before resolve :", email);

    if (email && !email.includes("@")) {
      const resolved = resolveContact(email);
      console.log("Resolved value :", resolved);

      if (resolved) {
        email = resolved;
      }
    }

    console.log("After resolve :", email);

    return {
      to: email || null,
      body: cleanBody || "Hello"
    };
  }

  if (action === "schedule") {
    let email = params.target;

    console.log("Before resolve:", email);

    if (email && !email.includes("@")) {
      const resolved = resolveContact(email);
      console.log("Resolved value:", resolved);

      if (resolved) {
        email = resolved;
      }
    }

    console.log("After resolve:", email);

    // ✅ Extract clean name safely
    const personNameRaw = params.target || "there";

    const cleaned = personNameRaw
      .replace(/[0-9._]/g, " ")
      .replace(/rockz|gaming|official/gi, "")
      .trim()
      .split(" ")[0];

    const personName =
      cleaned.length > 0
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : "there";

    if (!email || !email.includes("@")) {
      throw new Error(
        `Cannot resolve a valid email for "${params.target}" — add them to contacts.json`
      );
    }

    return {
      title: personName ? `Meeting with ${personName}` : "Meeting",
      datetime: parseTime(params.deadline),
      attendees: [email]
    };
  }
}
/**
 * Generate a unique execution ID in format EX-YYYYMMDD-NNN.
 */
function generateExecutionId() {
  executionCounter++;
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const counter = executionCounter.toString().padStart(3, "0");
  return `EX-${dateStr}-${counter}`;
}

/**
 * Main Execution Agent function.
 * 
 * @param {object} supervisorOutput - The validated Supervisor Agent output
 * @returns {object} Structured JSON output following the contract
 */
export async function execute(supervisorOutput, context = {}) {
  const { validated_action } = supervisorOutput;

  // 🔥 SUPPORT BOTH SINGLE + MULTI
  const actions = Array.isArray(validated_action)
    ? validated_action
    : [validated_action];

  const results = [];
  let paramsUsed = {};

  // Safety check: only execute if supervisor approved
  if (supervisorOutput.approved !== true) {
    return {
      agent: "execution_agent",
      execution_id: generateExecutionId(),
      action_executed: "none",
      params_used: {},
      simulated_result: "Execution blocked: Supervisor did not approve.",
      status: "failed",
      timestamp: new Date().toISOString()
    };
  }
  // 🔥 ENSURE schedule runs before reply
  actions.sort((a, b) => {
    if (a.action === "schedule") return -1;
    if (b.action === "schedule") return 1;
    return 0;
  });

  for (const step of actions) {
    let action, action_params, normalized_params;
    try {
      action = step.action;
      action_params = step.action_params || {};
      normalized_params = normalizeParams(action, action_params);
    } catch (prepErr) {
      console.error("[execution] Action prep error:", prepErr.message);
      results.push({
        action: step.action || "unknown",
        simulated_result: "Something went wrong while executing your request.",
        task_data: null,
        explanation: "Action could not be completed.",
        _failed: true,
      });
      createLog({ type: "system", title: "Execution prep error", details: prepErr.message, status: "failed" }).catch(() => { });
      continue;
    }

    let simulated_result;
    let taskData = null;

    // 🟢 SCHEDULE
    if (action === "schedule") {
      try {
        let description;

        // ✅ Clean name extraction
        const personNameRaw = normalized_params.attendees?.[0]
          ? normalized_params.attendees[0].split("@")[0]
          : action_params.target || "there";

        // Clean email-style names → proper names
        const cleaned = personNameRaw
          .replace(/[0-9._]/g, " ")
          .replace(/rockz|gaming|official/gi, "")
          .trim()
          .split(" ")[0];

        const personName =
          cleaned.length > 0
            ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
            : "there";

        // ✅ Always build a description (even if no message)
        const messageContent =
          context.pendingDescription || "Looking forward to connecting.";

        description = formatProfessionalEmail({
          person: personName,
          message: messageContent,
          meetLink: null,
          time: action_params.deadline
        });
        console.log("🧠 FINAL TITLE BEING SENT:", normalized_params.title);
        const result = await withRetry(
          () => createCalendarEvent({ ...normalized_params, description }),
          "create calendar event"
        );

        // 🔥 STORE LINK
        context.meetLink = result.meetLink;
        updateContext({
          lastPerson: action_params.target,
          lastMeeting: { time: action_params.deadline, link: result.meetLink },
          lastAction: "schedule",
          lastEntityLabel: `meeting with ${action_params.target || "attendee"}`,
        });
        simulated_result = `Meeting scheduled. Link: ${result.meetLink}`;
        const personLabel = action_params.target
          ? action_params.target.charAt(0).toUpperCase() + action_params.target.slice(1)
          : "attendee";
        createLog({
          type: "meeting",
          title: `Meeting scheduled with ${personLabel}`,
          details: result.meetLink ? `Meet link: ${result.meetLink}` : "No link generated",
          status: "success",
        }).catch(() => { });

      } catch (error) {
        console.error("Calendar API error:", error);
        const personLabel = action_params.target
          ? action_params.target.charAt(0).toUpperCase() + action_params.target.slice(1)
          : "attendee";
        const isContactMissing = /cannot resolve/i.test(error.message);
        createLog({
          type: "meeting",
          title: isContactMissing
            ? `Contact not found: ${action_params.target || "unknown"}`
            : `Failed to schedule meeting with ${personLabel}`,
          details: isContactMissing
            ? `Contact '${action_params.target}' not found. Add their email in Settings to schedule meetings.`
            : error.message,
          status: "failed",
        }).catch(() => { });

        const resultGenerator = SIMULATED_RESULTS[action];
        simulated_result = resultGenerator
          ? resultGenerator(action_params)
          : `Simulated: Action "${action}" executed successfully.`;
      }
    }

    // 📧 DIRECT EMAIL — supports both email addresses and contact names
    else if (action === "send_email") {
      let { to, subject, body } = action_params;
      // Resolve contact name → email if not already an address
      if (to && !to.includes("@")) {
        const resolved = resolveContact(to);
        if (resolved) {
          to = resolved;
        } else {
          simulated_result = `Contact '${action_params.to}' not found. Please provide a valid email or add the contact in Settings.`;
          createLog({
            type: "email",
            title: `Contact not found: ${action_params.to}`,
            details: "Add this contact in Settings to send emails by name.",
            status: "failed",
          }).catch(() => { });
          results.push({ action, simulated_result, task_data: null, explanation: generateExplanation(action, action_params), _failed: true });
          continue;
        }
      }
      try {
        const finalSubject = subject || "Regarding your request";
        await withRetry(() => sendEmail({ to, subject: finalSubject, body: body || "" }), "send email (direct)");
        simulated_result = `Email sent to ${to} with subject '${finalSubject}'`;
        paramsUsed = { to, subject: finalSubject };
        createLog({
          type: "email",
          title: `Email sent to ${to}`,
          details: `Subject: ${finalSubject}`,
          status: "success",
        }).catch(() => { });
        updateContext({ lastPerson: to, lastAction: "send_email", lastEntityLabel: `email to ${to}` });
      } catch (err) {
        console.error("send_email error:", err);
        simulated_result = "Failed to send email. Please check your email configuration.";
        createLog({
          type: "email",
          title: `Failed to send email to ${to || "unknown"}`,
          details: err.message,
          status: "failed",
        }).catch(() => { });
      }
    }

    // 🔵 EMAIL / REPLY
    else if (action === "reply") {
      // Message was absorbed into the calendar invite — skip the duplicate email
      if (context.meetLink) {
        simulated_result = "Message included in calendar invite — email skipped.";

        updateContext({
          lastPerson: action_params.target,
          lastAction: "reply"
        });
      } else {
        try {
          const personNameRaw = normalized_params.to
            ? normalized_params.to.split("@")[0]
            : action_params.target || "there";

          const cleaned = personNameRaw
            .replace(/[0-9._]/g, " ")
            .replace(/rockz|gaming|official/gi, "")
            .trim()
            .split(" ")[0];

          const personName =
            cleaned.length > 0
              ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
              : "there";

          const finalBody = formatProfessionalEmail({
            person: personName,
            message: normalized_params.body,
            meetLink: null,
            time: action_params.deadline
          });

          const subject = await generateSubjectLine(normalized_params.body, action_params.deadline);

          const result = await withRetry(
            () => sendEmail({ to: normalized_params.to, subject, body: finalBody }),
            "send email (reply)"
          );

          simulated_result = result.message;
          const recipientLabel = action_params.target || normalized_params.to || "recipient";
          createLog({
            type: "email",
            title: `Email sent to ${recipientLabel.charAt(0).toUpperCase() + recipientLabel.slice(1)}`,
            details: `Subject: ${subject}`,
            status: "success",
          }).catch(() => { });
          updateContext({
            lastPerson: action_params.target,
            lastAction: "reply",
            lastEntityLabel: `email to ${action_params.target || "recipient"}`,
          });

        } catch (error) {
          console.error("Gmail API error:", error);
          const recipientLabel = action_params.target || "recipient";
          const isContactMissing = !normalized_params.to || !normalized_params.to.includes("@");
          createLog({
            type: "email",
            title: isContactMissing
              ? `Contact not found: ${recipientLabel}`
              : `Failed to send email to ${recipientLabel}`,
            details: isContactMissing
              ? `"${recipientLabel}" is not in contacts.json — add their email to use this feature.`
              : error.message,
            status: "failed",
          }).catch(() => { });

          const resultGenerator = SIMULATED_RESULTS[action];
          simulated_result = resultGenerator
            ? resultGenerator(action_params)
            : `Simulated: Action "${action}" executed successfully.`;
        }
      }
    }

    // 🟤 GET TASKS
    else if (action === "get_tasks") {
      try {
        const filter = {};

        if (action_params?.status === "all") {
          // no status filter — return all tasks
        } else if (action_params?.status === "completed") {
          filter.status = "completed";
        } else {
          filter.status = "pending"; // default: pending only
        }

        if (action_params?.time === "today") {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          filter.dueTime = { $gte: start, $lte: end };
        }

        const tasks = await getTasksFiltered(filter);
        paramsUsed = action_params || {};
        simulated_result = tasks.length
          ? `You have ${tasks.length} task(s): ${tasks.map(t => t.task).join(", ")}`
          : "No tasks found";
        taskData = { count: tasks.length, tasks };
      } catch (err) {
        console.error("get_tasks error:", err);
        simulated_result = "Failed to retrieve tasks";
      }
    }

    // 🟢 COMPLETE TASK
    else if (action === "complete_task") {
      if (!action_params.task) {
        simulated_result = "Task name is required";
      } else {
        try {
          const completed = await completeTask(action_params.task);
          paramsUsed = { task: action_params.task };
          if (completed) {
            simulated_result = `Task completed: ${completed.task}`;
            taskData = { _id: completed._id, task: completed.task, status: completed.status };
            try { handleTaskCompleted(completed); } catch (automationErr) {
              console.error("[AUTOMATION] Error in handleTaskCompleted:", automationErr);
            }
            createLog({ type: "task", title: `Task completed: ${completed.task}`, status: "success" }).catch(() => { });
            updateNotionTaskStatus(completed.task).catch(() => {});
          } else {
            simulated_result = "Task not found";
            createLog({ type: "task", title: `Task not found: ${action_params.task}`, status: "failed" }).catch(() => { });
          }
        } catch (err) {
          console.error("complete_task error:", err);
          simulated_result = "Failed to complete task";
          createLog({ type: "task", title: `Failed to complete: ${action_params.task}`, details: err.message, status: "failed" }).catch(() => { });
        }
      }
    }

    // 🟣 CREATE TASK
    else if (action === "create_task") {
      if (!action_params.task) {
        simulated_result = "Task name is required";
      } else {
        try {
          const rawDueTime = action_params.dueTime || null;
          console.log("[create_task] task:", action_params.task, "| dueTime:", rawDueTime, "| recurring:", action_params.recurring || null);

          const parsedDue = rawDueTime ? parseTime(rawDueTime) : null;
          let finalDue = parsedDue;

          if (!finalDue && rawDueTime) {
            const now = new Date();

            if (/in\s+(\d+)\s+minute/.test(rawDueTime)) {
              const mins = parseInt(rawDueTime.match(/in\s+(\d+)/)[1]);
              finalDue = new Date(now.getTime() + mins * 60000).toISOString();
            }

            else if (/night/i.test(rawDueTime)) {
              const d = new Date();
              d.setHours(22, 0, 0, 0);
              finalDue = d.toISOString();
            }

            else if (/morning/i.test(rawDueTime)) {
              const d = new Date();
              d.setHours(9, 0, 0, 0);
              finalDue = d.toISOString();
            }
          }
          console.log("[create_task] parsedDue:", parsedDue);

          const newTask = { task: action_params.task, dueTime: finalDue, isRecurring: !!action_params.recurring };
          paramsUsed = { task: action_params.task, dueTime: rawDueTime };

          let createdTask = null;

          const isReminder = !!finalDue || !!action_params.recurring;

          if (!isReminder) {
            createdTask = await createTask(newTask);
          }
          const taskLabel = createdTask?.task || action_params.task;
          simulated_result = `Task created: ${taskLabel}`;
          taskData = {
            _id: createdTask?._id || null,
            task: taskLabel,
            status: createdTask?.status || "scheduled",
            dueTime: createdTask?.dueTime || finalDue,
            createdAt: createdTask?.createdAt || new Date()
          };

          if (action_params.recurring) {
            // ── Recurring job — build cron expression and register ──────────
            const cronExpr = buildCronExpression(action_params.recurring, rawDueTime);
            if (cronExpr) {
              const recurringJobId = createdTask
                ? `task-${createdTask._id}`
                : `reminder-${Date.now()}`;
              scheduleRecurring(recurringJobId, cronExpr, taskLabel, async () => {
                createLog({
                  type: "system",
                  title: `🔔 Reminder: ${taskLabel}`,
                  details: `Recurring (${action_params.recurring})`,
                  status: "success",
                }).catch(() => { });
              });
              updateContext({ lastJobId: recurringJobId, lastAction: "create_task", lastEntityLabel: `task: ${taskLabel}`, lastEntityType: "automation" });
              simulated_result += ` — recurring ${action_params.recurring}, next trigger registered`;
            }

          } else if (finalDue) {
            // ── One-time reminder — schedule a single setTimeout via scheduleOnce ─
            const fireDate = new Date(finalDue);
            const now = new Date();

            console.log("[create_task] fireDate:", fireDate.toISOString(), "| now:", now.toISOString(), "| diff ms:", fireDate.getTime() - now.getTime());

            if (fireDate.getTime() > now.getTime() - 2000) {
              console.log("✅ Scheduling reminder for:", taskLabel, finalDue);
              const onceJobId = scheduleOnce(taskLabel, finalDue, async () => {
                createLog({
                  type: "system",
                  title: `🔔 Reminder: ${taskLabel}`,
                  details: `Triggered at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
                  status: "success",
                }).catch(() => { });
              });

              if (onceJobId) {
                if (onceJobId && createdTask?._id) {
                  await updateTask(createdTask._id, { jobId: onceJobId });
                }
              }
              if (onceJobId) updateContext({ lastJobId: onceJobId, lastEntityLabel: `reminder: ${taskLabel}`, lastEntityType: "automation" });
              simulated_result += ` — reminder set for ${fireDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
            } else {
              console.warn("Skipped scheduling past time:", taskLabel, finalDue);
            }
          } else {
            console.log("[create_task] no dueTime — task created without reminder");
            updateContext({
              lastEntityType: isReminder ? "automation" : "task"
            });
          }

          const priorityLabel = action_params.priority === "high" ? " [HIGH PRIORITY]" : "";
          const recurringDetail = action_params.recurring ? `Recurring: ${action_params.recurring}` : (parsedDue ? `Due: ${new Date(parsedDue).toLocaleString()}` : "");
          createLog({
            type: "task",
            title: isReminder
              ? `Reminder scheduled: ${taskLabel}`
              : `Task created: ${taskLabel}${priorityLabel}`,
            details: recurringDetail,
            status: "success"
          }).catch(() => { });
          updateContext({
            lastAction: "create_task",
            lastEntityLabel: isReminder ? `reminder: ${taskLabel}` : `task: ${taskLabel}`,
            lastEntityType: isReminder ? "automation" : "task"
          });

          // Best-effort Notion sync — does not block or throw
          createNotionTask({ title: taskLabel, due: finalDue }).catch(() => {});

        } catch (err) {
          console.error("create_task error:", err);
          simulated_result = "Failed to create task";
          createLog({ type: "task", title: `Failed to create: ${action_params.task}`, details: err.message, status: "failed" }).catch(() => { });
        }
      }
    }

    // 🔴 DELETE TASK
    else if (action === "delete_task") {
      try {
        const rawTask = action_params?.task || action_params?.target;

        if (!rawTask || typeof rawTask !== "string") {
          simulated_result = "Please specify what to delete.";
          results.push({
            action,
            simulated_result,
            task_data: null,
            explanation: generateExplanation(action, action_params),
            _failed: true,
          });
          continue;
        }

        const label = rawTask.trim().toLowerCase();

        const tasks = await getAllTasks();
        const task = tasks.find(t => t.task.toLowerCase() === label);

        // ✅ CASE 1: TASK EXISTS
        if (task) {
          if (task.jobId) {
            cancelSchedule(task.jobId);
          }

          await deleteTask(task.task);

          simulated_result = `Deleted "${task.task}" successfully.`;

          updateContext({
            lastJobId: null,
            lastEntityLabel: null,
            lastEntityType: null
          });

          createLog({
            type: "task",
            title: `Deleted: ${task.task}`,
            status: "success",
          }).catch(() => { });
        }

        // ✅ CASE 2: AUTOMATION EXISTS
        else {
          const cancelled = cancelSchedule(jobId);

          if (cancelled) {
            simulated_result = `Automation "${label}" cancelled successfully.`;

            updateContext({
              lastJobId: null,
              lastEntityLabel: null,
              lastEntityType: null
            });

            createLog({
              type: "system",
              title: `Automation cancelled: ${label}`,
              status: "success",
            }).catch(() => { });
          } else {
            simulated_result = "Task or automation not found";
          }
        }

      } catch (err) {
        console.error("delete_task error:", err);
        simulated_result = "Failed to delete task";
      }
    }

    // 🚫 CANCEL AUTOMATION
    else if (action === "cancel_automation") {
      const { getContext } = await import("../context/contextStore.js");
      const ctx = getContext();
      const jobId = ctx.lastJobId;
      if (jobId) {
        const { cancelSchedule } = await import("../automation/scheduler.js");
        const cancelled = cancelSchedule(jobId);
        if (cancelled) {
          simulated_result = "Automation cancelled successfully.";
          updateContext({ lastJobId: null, lastEntityLabel: null, lastEntityType: null });
          createLog({ type: "system", title: "Automation cancelled", details: `Job ${jobId} removed.`, status: "success" }).catch(() => { });
        } else {
          simulated_result = "No active automation found to cancel.";
        }
      } else if (ctx.lastEntityType === "task" && ctx.lastEntityLabel) {
        // User said "delete it" but last entity was a task, not an automation
        const taskName = ctx.lastEntityLabel.replace(/^task:\s*/i, "");
        try {
          const deleted = await deleteTask(taskName);
          if (deleted) {
            simulated_result = `Task deleted: ${deleted.task}`;
            updateContext({ lastEntityLabel: null, lastEntityType: null });
            createLog({ type: "task", title: `Task deleted: ${deleted.task}`, status: "success" }).catch(() => { });
          } else {
            simulated_result = "No matching task or automation found to delete.";
          }
        } catch (err) {
          simulated_result = "No active automation found to cancel.";
        }
      } else {
        simulated_result = "No active automation found to cancel.";
      }
    }

    // 🟡 OTHER ACTIONS
    else {
      const resultGenerator = SIMULATED_RESULTS[action];
      simulated_result = resultGenerator
        ? resultGenerator(action_params)
        : `Simulated: Action "${action}" executed successfully.`;
    }

    results.push({
      action,
      simulated_result,
      task_data: taskData,
      explanation: generateExplanation(action, action_params),
    });
  }
  return {
    agent: "execution_agent",
    execution_id: generateExecutionId(),

    // ✅ KEEP PIPELINE HAPPY
    action_executed: actions.map(a => a.action).join(", "),

    params_used: paramsUsed,

    simulated_result: results
      .map(r => r.simulated_result)
      .join(" | "),

    // ✅ KEEP YOUR STRUCTURE
    results,

    status: results.length > 0 && results.every(r => r._failed) ? "failed" : "completed",
    timestamp: new Date().toISOString()
  };
}


/**
 * Reset execution counter (for testing purposes).
 */
export function resetCounter() {
  executionCounter = 0;
}
