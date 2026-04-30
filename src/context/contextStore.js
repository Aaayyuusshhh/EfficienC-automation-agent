/**
 * contextStore.js
 *
 * Lightweight in-memory short-term context.
 * Remembers the last referenced person so follow-up commands like
 * "message him" resolve correctly without repeating the name.
 *
 * Context expires after CONTEXT_TTL_MS of inactivity to prevent
 * stale references across unrelated sessions.
 */

const CONTEXT_TTL_MS = 10 * 60 * 1000; // 10 minutes

let context = {
  lastPerson:      null,   // lower-case name key, e.g. "aayush"
  lastMeeting:     null,   // { time, link }
  lastAction:      null,   // e.g. "schedule" | "reply"
  lastCommand:     null,   // raw input text of the most recent command
  lastActionTime:  null,   // Date.now() when last updated
  lastEntityLabel: null,   // human label for follow-up resolution, e.g. "meeting with rahul"
  lastJobId:       null,   // scheduler jobId — used by cancel_automation
  lastEntityType:  null,   // "automation" | "task" — used by "delete it" routing
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function isFresh() {
  return context.lastActionTime !== null &&
    (Date.now() - context.lastActionTime) < CONTEXT_TTL_MS;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function updateContext(data) {
  context = { ...context, ...data, lastActionTime: Date.now() };
}

export function getContext() {
  // Auto-expire stale context
  if (!isFresh()) resetContext();
  return { ...context };
}

export function resetContext() {
  context = {
    lastPerson:      null,
    lastMeeting:     null,
    lastAction:      null,
    lastCommand:     null,
    lastActionTime:  null,
    lastEntityLabel: null,
    lastJobId:       null,
    lastEntityType:  null,
  };
}

/**
 * Resolve action references ("it", "that", "the meeting") using the last
 * stored entity label. Only activates when an action verb is present, to
 * avoid false replacements in complex sentences.
 *
 * "Reschedule it to 7 PM" → "Reschedule meeting with rahul to 7 PM"
 */
export function resolveActionContext(input) {
  if (!input || typeof input !== "string") return input;

  const ctx = getContext();
  if (!ctx.lastEntityLabel) return input;

  const lower = input.toLowerCase();

  // Only resolve when there's a clear intent to act on the previous entity
  const hasActionVerb = /\b(reschedule|cancel|update|change|move|postpone|delay|modify|remove|delete|edit)\b/.test(lower);
  if (!hasActionVerb) return input;

  return input
    .replace(/\bthe meeting\b/gi, ctx.lastEntityLabel)
    .replace(/\bthe task\b/gi,    ctx.lastEntityLabel)
    .replace(/\bthe email\b/gi,   ctx.lastEntityLabel)
    .replace(/\bit\b/gi,          ctx.lastEntityLabel)
    .replace(/\bthat\b/gi,        ctx.lastEntityLabel);
}

/**
 * Resolve third-person pronouns in `input` using the remembered lastPerson.
 *
 * "message him"   → "message aayush"     (if lastPerson = "aayush")
 * "send her mail" → "send aayush mail"
 * "tell them"     → "tell aayush"
 *
 * Returns the original string unchanged if no context is available.
 */
export function resolvePronouns(input) {
  if (!input || typeof input !== "string") return input;

  const ctx = getContext();
  if (!ctx.lastPerson) return input;

  const person = ctx.lastPerson;

  return input
    .replace(/\bhim\b/gi,  person)
    .replace(/\bher\b/gi,  person)   // works for "message her", "call her"
    .replace(/\bthem\b/gi, person)
    .replace(/\bhe\b/gi,   person)
    .replace(/\bshe\b/gi,  person);
}
