/**
 * Logger
 * 
 * Responsibility: Log full pipeline execution records to filesystem.
 * Each pipeline run produces one JSON log file.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGS_DIR = join(__dirname, "..", "logs");

// Pipeline counter for generating unique pipeline IDs within a session
let pipelineCounter = 0;

/**
 * Ensure logs directory exists.
 */
function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Generate a unique pipeline ID.
 * Format: PL-YYYYMMDD-HHMMSS-NNN
 */
export function generatePipelineId() {
  pipelineCounter++;
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const timeStr = now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0");
  const counter = pipelineCounter.toString().padStart(3, "0");
  return `PL-${dateStr}-${timeStr}-${counter}`;
}

/**
 * Log a successful pipeline execution.
 * 
 * @param {object} record - Full pipeline log record
 * @returns {object} The saved log record
 */
export function logPipelineSuccess(record) {
  ensureLogsDir();

  const logEntry = {
    ...record,
    logged_at: new Date().toISOString()
  };

  const filename = `${record.pipeline_id}.json`;
  const filepath = join(LOGS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(logEntry, null, 2), "utf-8");

  return logEntry;
}

/**
 * Log a pipeline failure (stopped at some step).
 * 
 * @param {object} record - Partial pipeline record with failure info
 * @returns {object} The saved log record
 */
export function logPipelineFailure(record) {
  ensureLogsDir();

  const logEntry = {
    pipeline_id: record.pipeline_id || generatePipelineId(),
    ...record,
    final_status: record.status || "failed",
    logged_at: new Date().toISOString()
  };

  const filename = `${logEntry.pipeline_id}.json`;
  const filepath = join(LOGS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(logEntry, null, 2), "utf-8");

  return logEntry;
}

/**
 * Retrieve all pipeline logs.
 * @returns {object[]} Array of log records, newest first
 */
export function getAllLogs() {
  ensureLogsDir();

  const files = readdirSync(LOGS_DIR).filter(f => f.endsWith(".json"));
  const logs = files.map(f => {
    const content = readFileSync(join(LOGS_DIR, f), "utf-8");
    return JSON.parse(content);
  });

  // Sort newest first
  logs.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
  return logs;
}

/**
 * Retrieve a single pipeline log by ID.
 * @param {string} pipelineId - The pipeline ID to look up
 * @returns {object|null} The log record or null if not found
 */
export function getLogById(pipelineId) {
  ensureLogsDir();

  const filepath = join(LOGS_DIR, `${pipelineId}.json`);
  if (!existsSync(filepath)) return null;

  const content = readFileSync(filepath, "utf-8");
  return JSON.parse(content);
}
