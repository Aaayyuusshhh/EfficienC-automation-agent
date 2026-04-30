/**
 * contactResolver.js
 *
 * Unified contact lookup with support for both the old flat format
 *   { "name": "email@..." }
 * and the new rich format
 *   { "name": { "email": "...", "displayName": "..." } }
 *
 * Public API
 * ──────────
 * resolveContact(name)        → email string | null          (backward compat)
 * getContact(name)            → { email, displayName } | null
 * getAllContactNames()         → string[]
 * resolveContactStrict(name)  → email string | throws
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CONTACTS_PATH = path.join(__dirname, "../data/contacts.json");

// ── Internal loader ───────────────────────────────────────────────────────────
// Reads fresh from disk on each call so edits to contacts.json take effect
// without a server restart.

function loadContacts() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONTACTS_PATH, "utf-8"));
    // Normalise both flat and rich formats into the rich shape
    const normalised = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === "string") {
        normalised[key.toLowerCase()] = { email: val, displayName: key };
      } else {
        normalised[key.toLowerCase()] = {
          email:       val.email       ?? null,
          displayName: val.displayName ?? (key.charAt(0).toUpperCase() + key.slice(1)),
        };
      }
    }
    return normalised;
  } catch (err) {
    console.error("[contactResolver] Failed to load contacts.json:", err.message);
    return {};
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the email address for a given name, or null if not found.
 * Backward-compatible replacement for the old resolveContact().
 */
export function resolveContact(name) {
  if (!name) return null;
  const contacts = loadContacts();
  const entry    = contacts[name.toLowerCase().trim()];
  return entry?.email ?? null;
}

/**
 * Returns the full contact object { email, displayName } or null.
 */
export function getContact(name) {
  if (!name) return null;
  const contacts = loadContacts();
  return contacts[name.toLowerCase().trim()] ?? null;
}

/**
 * Returns all known contact keys (lowercase).
 */
export function getAllContactNames() {
  return Object.keys(loadContacts());
}

/**
 * Resolves a name to an email, throwing a descriptive error if not found.
 * Use this in execution paths where a missing contact is a hard failure.
 */
export function resolveContactStrict(name) {
  const email = resolveContact(name);
  if (email) return email;

  const known = getAllContactNames().join(", ") || "(none)";
  throw new Error(
    `Contact "${name}" not found. ` +
    `Known contacts: ${known}. ` +
    `Add "${name}" to src/data/contacts.json to enable this action.`
  );
}

// Keep the old default export so any file that does
//   import resolveContact from "./contactResolver.js"
// still works without modification.
export default resolveContact;
