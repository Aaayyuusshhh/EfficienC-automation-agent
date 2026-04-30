/**
 * scheduler.js
 *
 * Pure in-memory scheduler — no external libraries.
 *
 * One-time jobs  : setTimeout  → removed from activeJobs after execution
 * Recurring jobs : setTimeout (aligned to target time) → setInterval (period)
 *
 * activeJobs Map: jobId → { type: "timeout"|"interval", handle, label, spec }
 * Callers query activeJobs.size > 0 to determine "Running" vs "Idle".
 */

import { createLog } from "../repositories/actionLogRepository.js";
import ScheduledJob from "../models/ScheduledJob.js";
import { notificationEmitter } from "../events/notificationEmitter.js";
import { markTaskInProgress } from "../integrations/notionService.js";

// ── Global job registry ───────────────────────────────────────────────────────
// Exported so server.js can read it directly in the /scheduled route.

export const activeJobs = new Map(); // jobId → { type, handle, label, spec }

function nextId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Internal executor — called by every timer fire ────────────────────────────

async function executeJob(jobId, label, callback) {
  console.log(`[DEBUG] executeJob called for: ${label}`);
  try {
    await callback();
    console.log("[TRACE] THIS BLOCK EXECUTED");
    notificationEmitter.emit("reminder", { type: "REMINDER_TRIGGER", label, timestamp: Date.now() });
    console.log("[scheduler] EVENT EMITTED for:", label);
    console.log("[DEBUG] Calling markTaskInProgress:", label);
    await markTaskInProgress(label);
  } catch (err) {
    console.error(`[scheduler] Job error: ${jobId} — "${label}"`, err.message);
    createLog({
      type: "system",
      title: `Automation failed: ${label}`,
      details: err.message,
      status: "failed",
    }).catch(() => {});
  }
}

// ── Cron expression builder (unchanged — used by executionAgent) ──────────────

const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseTimeComponents(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;

  let h    = parseInt(m[1], 10);
  const mn = m[2] ? parseInt(m[2], 10) : 0;
  const p  = (m[3] || "").toLowerCase();

  if (p === "pm" && h < 12) h += 12;
  if (p === "am" && h === 12) h = 0;

  return { h, m: mn };
}

export function buildCronExpression(recurring, timeString) {
  const time = parseTimeComponents(timeString);
  if (!time) return null;

  const { h, m } = time;

  if (recurring === "daily")    return `${m} ${h} * * *`;
  if (recurring === "weekdays") return `${m} ${h} * * 1-5`;

  const weekMatch = (recurring || "").match(/^weekly:(\w+)$/i);
  if (weekMatch) {
    const dayNum = DAY_MAP[weekMatch[1].toLowerCase()];
    if (dayNum !== undefined) return `${m} ${h} * * ${dayNum}`;
  }

  return null;
}

// ── Parse a 5-field cron string into { h, m, dowField } ──────────────────────

function parseCron(cronExpr) {
  const parts = (cronExpr || "").split(" ");
  if (parts.length < 5) return null;
  const m   = parseInt(parts[0], 10);
  const h   = parseInt(parts[1], 10);
  const dow = parts[4]; // day-of-week field: "*" | "1-5" | "0"–"6"
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m, dow };
}

// Calculate ms from now until next wall-clock occurrence of HH:MM
// (same day if still in the future, otherwise tomorrow)
function msUntilNext(h, m) {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Calculate ms from now until next occurrence of a specific day-of-week at HH:MM
function msUntilNextWeekday(targetDow, h, m) {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  const daysUntil = ((targetDow - now.getDay() + 7) % 7) || 7;
  next.setDate(next.getDate() + daysUntil);
  return next.getTime() - now.getTime();
}

// ── scheduleOnce — one-time job at an ISO datetime ───────────────────────────
// existingJobId: pass when restoring from DB so the same ID is reused

export function scheduleOnce(label, isoDatetime, callback, existingJobId = null) {
  const fireAt = new Date(isoDatetime).getTime();
  const delay  = fireAt - Date.now();

  if (delay <= 0) {
    console.warn(`[scheduler] Skipping past-due job: "${label}" (was ${new Date(isoDatetime).toLocaleTimeString()})`);
    return null;
  }

  const jobId = existingJobId || nextId();

  const timeoutId = setTimeout(async () => {
    activeJobs.delete(jobId);
    ScheduledJob.findOneAndUpdate({ jobId }, { status: "completed" }).catch(() => {});
    await executeJob(jobId, label, callback);
    console.log(`[scheduler] Job completed and removed: ${jobId}`);
  }, delay);

  activeJobs.set(jobId, { type: "timeout", handle: timeoutId, label, spec: isoDatetime });

  // Persist to DB only for new jobs (not during restore)
  if (!existingJobId) {
    ScheduledJob.create({ jobId, type: "once", label, spec: isoDatetime }).catch(() => {});
  }

  console.log("Reminder delay (ms):", delay);
  console.log(`[scheduler] Job scheduled: ${jobId} — "${label}" fires in ${Math.round(delay / 1000)}s`);
  return jobId;
}

// ── scheduleRecurring — aligned to wall-clock time, then setInterval ──────────

export function scheduleRecurring(id, cronExpr, label, callback) {
  // Cancel any previous job registered under this id
  cancelSchedule(id);

  const parsed = parseCron(cronExpr);
  if (!parsed) {
    console.error(`[scheduler] Cannot parse cron expression: "${cronExpr}"`);
    return null;
  }

  const { h, m, dow } = parsed;
  const isWeekly   = /^\d$/.test(dow);    // single digit → specific weekday
  const isWeekdays = dow === "1-5";
  const periodMs   = isWeekly ? 7 * 24 * 3_600_000 : 24 * 3_600_000;

  // Time until first fire
  const initialDelay = isWeekly
    ? msUntilNextWeekday(parseInt(dow, 10), h, m)
    : msUntilNext(h, m);

  // Phase 1: wait until the aligned wall-clock time
  const timeoutId = setTimeout(async () => {
    await executeJob(id, label, callback);

    // Phase 2: repeat at fixed period
    const intervalId = setInterval(async () => {
      await executeJob(id, label, callback);
    }, periodMs);

    // Swap entry from timeout → interval so listScheduled still sees it
    activeJobs.set(id, { type: "interval", handle: intervalId, label, spec: cronExpr });
  }, initialDelay);

  activeJobs.set(id, { type: "timeout", handle: timeoutId, label, spec: cronExpr });

  // Persist recurring jobs to DB (upsert so restore calls are idempotent)
  ScheduledJob.findOneAndUpdate(
    { jobId: id },
    { jobId: id, type: "recurring", label, spec: cronExpr, status: "active" },
    { upsert: true, new: true }
  ).catch(() => {});

  console.log(
    `[scheduler] Job scheduled: ${id} — "${label}" ` +
    `first fire in ${Math.round(initialDelay / 1000)}s, then every ${periodMs / 3_600_000}h`
  );
  return id;
}

// ── Management ────────────────────────────────────────────────────────────────

export function cancelSchedule(id) {
  const job = activeJobs.get(id);
  if (!job) return false;

  if (job.type === "timeout")  clearTimeout(job.handle);
  if (job.type === "interval") clearInterval(job.handle);

  activeJobs.delete(id);
  ScheduledJob.findOneAndUpdate({ jobId: id }, { status: "cancelled" }).catch(() => {});
  console.log(`[scheduler] Cancelled: ${id} ("${job.label}")`);
  return true;
}

// ── Cancel by label — fallback for jobs not linked to a DB task ───────────────
export function cancelScheduleByLabel(label) {
  if (!label) return false;
  const clean = (str) => (str ?? "").toLowerCase().trim().replace(/^reminder:\s*|^task:\s*/i, "");
  for (const [id, job] of activeJobs.entries()) {
    if (clean(job.label) === clean(label)) {
      if (job.type === "timeout")  clearTimeout(job.handle);
      if (job.type === "interval") clearInterval(job.handle);
      activeJobs.delete(id);
      ScheduledJob.findOneAndUpdate({ jobId: id }, { status: "cancelled" }).catch(() => {});
      console.log(`[scheduler] Cancelled by label: ${id} ("${job.label}")`);
      return true;
    }
  }
  return false;
}

// ── Restore jobs from DB on server startup ────────────────────────────────────

export async function restoreJobs() {
  try {
    const pending = await ScheduledJob.find({ status: "active" });
    let restored = 0;

    for (const job of pending) {
      if (activeJobs.has(job.jobId)) continue; // already in memory

      if (job.type === "once") {
        const fireAt = new Date(job.spec).getTime();
        if (fireAt <= Date.now()) {
          // Past-due — mark complete, do not reschedule
          await ScheduledJob.findOneAndUpdate({ jobId: job.jobId }, { status: "completed" });
          continue;
        }
        scheduleOnce(job.label, job.spec, async () => {
          createLog({
            type: "system",
            title: `🔔 Reminder: ${job.label}`,
            details: "Restored reminder triggered after server restart.",
            status: "success",
          }).catch(() => {});
        }, job.jobId); // pass existing ID so activeJobs key matches DB
        restored++;

      } else if (job.type === "recurring") {
        scheduleRecurring(job.jobId, job.spec, job.label, async () => {
          createLog({
            type: "system",
            title: `🔔 Reminder: ${job.label}`,
            details: "Recurring reminder triggered.",
            status: "success",
          }).catch(() => {});
        });
        restored++;
      }
    }

    if (restored > 0) console.log(`[scheduler] Restored ${restored} job(s) from DB.`);
  } catch (err) {
    console.error("[scheduler] Could not restore jobs:", err.message);
  }
}

export function listScheduled() {
  return Array.from(activeJobs.entries()).map(([id, { type, label, spec }]) => ({
    id,
    type:  type === "interval" ? "cron" : "timeout",
    label,
    spec,
  }));
}
