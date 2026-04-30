/**
 * nameNormalizer.js
 *
 * Corrects voice-garbled or misspelled contact names in raw input
 * BEFORE the AI planner sees the text.
 *
 * Two-level strategy:
 *   1. Manual corrections  — explicit aliases (highest priority, zero cost)
 *   2. Fuzzy matching       — Levenshtein distance against known contacts
 *
 * Both levels are case-insensitive and only touch word tokens ≥ 3 chars,
 * so common short words ("to", "at", "the") are never replaced.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CONTACTS_PATH = path.join(__dirname, "../data/contacts.json");

// ── Command-level keyword corrections (voice garbles + common typos) ──────────
// Multi-word phrases must be listed BEFORE single-word entries so phrase
// replacement runs first and prevents partial word overlap.

const PHRASE_CORRECTIONS = [
  ["reset dual",    "reschedule"],
  ["reset duel",    "reschedule"],
  ["re schedule",   "reschedule"],
  ["re mind",       "remind"],
  ["shadyul me",    "schedule"],
];

const KEYWORD_CORRECTIONS = {
  shadyul:    "schedule",
  shadule:    "schedule",
  schejul:    "schedule",
  shedule:    "schedule",
  schedulle:  "schedule",
  rechedule:  "reschedule",
  reschedual: "reschedule",
  reschudule: "reschedule",
  reshcedule: "reschedule",
  remaind:    "remind",
  remined:    "remind",
  reminde:    "remind",
  cansel:     "cancel",
  cancle:     "cancel",
  emaill:     "email",
  meetting:   "meeting",
  metting:    "meeting",
};

// Known intent keywords — fuzzy-matched as a final safety net for unknown typos
const ACTION_KEYWORDS = [
  "schedule", "reschedule", "remind", "reminder",
  "send", "email", "cancel", "meeting", "delete",
];

function fuzzyCorrectKeyword(word) {
  // Min length 4 to avoid replacing short common words
  if (word.length < 4) return null;
  let best = null, bestDist = Infinity;
  for (const kw of ACTION_KEYWORDS) {
    if (Math.abs(word.length - kw.length) > 2) continue;
    const dist = levenshtein(word, kw);
    if (dist <= 2 && dist < bestDist) { best = kw; bestDist = dist; }
  }
  return best;
}

/**
 * Correct command-level voice garbles and typos BEFORE any other processing.
 * Must run before pronoun/context resolution so "rechedule it" becomes "reschedule it"
 * in time for the action-reference resolver to match "reschedule".
 */
export function normalizeCommandInput(input) {
  if (!input || typeof input !== "string") return input;

  let result = input;

  // Phase 1: phrase-level (multi-word voice garbles)
  for (const [wrong, right] of PHRASE_CORRECTIONS) {
    result = result.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), right);
  }

  // Phase 2 + 3: exact keyword correction, then fuzzy fallback
  const tokens = result.split(/\b/);
  return tokens.map(token => {
    if (!/^[a-zA-Z]{4,}$/.test(token)) return token;
    const lc = token.toLowerCase();
    const exact = KEYWORD_CORRECTIONS[lc];
    const fix   = exact ?? fuzzyCorrectKeyword(lc);
    if (!fix || fix === lc) return token;
    return token[0] === token[0].toUpperCase()
      ? fix.charAt(0).toUpperCase() + fix.slice(1)
      : fix;
  }).join("");
}

// ── Manual alias table ────────────────────────────────────────────────────────
// Add entries here when voice consistently mis-hears a specific name.
// Keys are lower-case misspellings; values are the correct contact key.
const MANUAL_ALIASES = {
  // aayush variations
  ayush:    "aayush",
  aayus:    "aayush",
  ayus:     "aayush",
  aayuush:  "aayush",
  ayushh:   "aayush",
  // kimya variations
  kimmyo:   "kimya",
  kimyo:    "kimya",
  kimia:    "kimya",
  kiimya:   "kimya",
  // ishita variations
  ishitaa:  "ishita",
  eshita:   "ishita",
  ishitha:  "ishita",
};

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  // Build DP table
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      dp[i][j] = i === 0 ? j : 0;
    }
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ── Load known contacts once at module init ───────────────────────────────────
let _knownNames = [];
try {
  const raw = fs.readFileSync(CONTACTS_PATH, "utf-8");
  _knownNames = Object.keys(JSON.parse(raw)).map(k => k.toLowerCase());
} catch {
  // contacts file missing or unreadable — normalization will still apply manual aliases
  _knownNames = [];
}

// ── Core correction logic ─────────────────────────────────────────────────────
/**
 * Try to correct a single lower-case word token.
 * Returns the corrected name if confident, or null if no correction is needed.
 */
function correctWord(word) {
  // 1. Manual alias (fastest, most reliable)
  if (MANUAL_ALIASES[word]) return MANUAL_ALIASES[word];

  // 2. Already a known name — preserve as-is
  if (_knownNames.includes(word)) return null;

  // 3. Fuzzy match — only against names with length ≥ 4 to avoid false positives
  let bestName = null;
  let bestDist = Infinity;

  for (const name of _knownNames) {
    if (name.length < 4) continue;

    // Require the token length to be within 2 of the candidate name length
    if (Math.abs(word.length - name.length) > 2) continue;

    // Tolerance: 1 edit for 4-5 char names, 2 edits for 6+ char names
    const maxDist = name.length >= 6 ? 2 : 1;
    const dist    = levenshtein(word, name);

    if (dist <= maxDist && dist < bestDist) {
      bestName = name;
      bestDist = dist;
    }
  }

  return bestName;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Normalize all name-like tokens in `input`.
 * Preserves original casing / punctuation / spacing for non-name tokens.
 *
 * @param {string} input  — raw command text
 * @returns {string}      — corrected command text
 */
export function normalizeInput(input) {
  if (!input || typeof input !== "string") return input;

  // Split on word boundaries (preserves spaces, punctuation, etc.)
  const tokens = input.split(/\b/);

  const result = tokens.map(token => {
    // Only inspect purely alphabetic tokens of length ≥ 3
    if (!/^[a-zA-Z]{3,}$/.test(token)) return token;

    const correction = correctWord(token.toLowerCase());
    if (!correction) return token;

    // Preserve original capitalisation style
    if (token[0] === token[0].toUpperCase()) {
      return correction.charAt(0).toUpperCase() + correction.slice(1);
    }
    return correction;
  });

  return result.join("");
}

/**
 * Reload known names (e.g. after contacts.json is updated at runtime).
 */
export function reloadContacts() {
  try {
    const raw = fs.readFileSync(CONTACTS_PATH, "utf-8");
    _knownNames = Object.keys(JSON.parse(raw)).map(k => k.toLowerCase());
  } catch {
    // keep existing list
  }
}
