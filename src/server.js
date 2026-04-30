import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import { connectDB } from "./config/db.js";
import { runPipeline } from "./orchestrator.js";
import * as taskManager from "./modules/taskManager.js";
import { getLogs } from "./repositories/actionLogRepository.js";
import { listScheduled, activeJobs, restoreJobs, cancelSchedule } from "./automation/scheduler.js";
import { notificationEmitter } from "./events/notificationEmitter.js";

// ── SSE client registry ────────────────────────────────────────────────────────
const sseClients = new Set();

notificationEmitter.on("reminder", (data) => {
  console.log("[SSE] Dispatching to", sseClients.size, "client(s):", data.label);
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
});

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
const CONTACTS_PATH = path.join(__serverDir, "./data/contacts.json");

function ensureContactsFile() {
  const dir = path.dirname(CONTACTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONTACTS_PATH)) fs.writeFileSync(CONTACTS_PATH, "{}", "utf-8");
}

function loadContactsRaw() {
  try { return JSON.parse(fs.readFileSync(CONTACTS_PATH, "utf-8")); }
  catch { return {}; }
}
function saveContactsRaw(data) {
  ensureContactsFile();
  fs.writeFileSync(CONTACTS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// Multer: keep audio in memory — we forward it straight to the Whisper server
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB hard cap
});

const app = express();

// CORS — allow browser requests from the Vite dev server and any local origin
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.use(express.json());

// Human-readable messages for known pipeline failure reasons
const FAILURE_MESSAGES = {
  empty_input:          "Please enter a command.",
  no_actions_extracted: "I didn't understand that. Try rephrasing — e.g. \"schedule a meeting with Aayush\" or \"remind me to call mom\".",
  all_actions_failed:   "None of the requested actions could be completed. Check that contact names are correct.",
  decision_agent_error: "Internal error while processing your command. Please try again.",
  execution_agent_error:"Something went wrong while executing. Please try again.",
};

function friendlyMessage(result) {
  if (result.status === "success") {
    const count  = result.data?.actions_count ?? 1;
    const failed = result.data?.actions_failed?.length ?? 0;
    if (failed > 0) {
      return `${count - failed} of ${count} action${count > 1 ? "s" : ""} completed — ${failed} could not be executed.`;
    }
    return count > 1 ? `${count} actions completed successfully.` : "Done.";
  }
  return FAILURE_MESSAGES[result.data?.reason] ?? result.data?.reason ?? "Command failed. Please try again.";
}

// POST /command — run any natural-language input through the full pipeline
app.post("/command", async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return res.status(400).json({ success: false, message: "Please enter a command.", data: null });
  }
  try {
    const result = await runPipeline(input.trim());
    return res.json({
      success: result.status === "success",
      message: friendlyMessage(result),
      data: result.data,
      explanation: result.explanation ?? null,
    });
  } catch (err) {
    console.error("Pipeline error:", err);
    return res.status(500).json({ success: false, message: "Internal error — please try again.", data: null });
  }
});

// GET /tasks — retrieve tasks with optional status and today filters
// Query params: status=pending|completed, today=true
app.get("/tasks", async (req, res) => {
  try {
    const filter = {};

    if (req.query.status === "pending" || req.query.status === "completed") {
      filter.status = req.query.status;
    }

    if (req.query.today === "true") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      filter.dueTime = { $gte: start, $lte: end };
    }

    // Never surface recurring reminders in the task list — they belong in Automations
    filter.isRecurring = { $ne: true };

    const tasks = await taskManager.getTasksFiltered(filter);
    return res.json({
      success: true,
      message: tasks.length ? "Tasks retrieved" : "No tasks found",
      data: { count: tasks.length, tasks }
    });
  } catch (err) {
    console.error("get tasks error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve tasks", data: null });
  }
});

// POST /complete — mark a task as completed by name
app.post("/complete", async (req, res) => {
  const { task } = req.body;
  if (!task || typeof task !== "string" || task.trim().length === 0) {
    return res.status(400).json({ success: false, message: "task is required and must be a non-empty string", data: null });
  }
  try {
    const completed = await taskManager.completeTask(task.trim());
    if (!completed) {
      return res.status(404).json({ success: false, message: "Task not found or already completed", data: null });
    }
    return res.json({
      success: true,
      message: "Task completed",
      data: { _id: completed._id, task: completed.task, status: completed.status }
    });
  } catch (err) {
    console.error("complete task error:", err);
    return res.status(500).json({ success: false, message: "Failed to complete task", data: null });
  }
});

// POST /delete — delete a task by name
app.post("/delete", async (req, res) => {
  const { task } = req.body;
  if (!task || typeof task !== "string" || task.trim().length === 0) {
    return res.status(400).json({ success: false, message: "task is required and must be a non-empty string", data: null });
  }
  try {
    const deleted = await taskManager.deleteTask(task.trim());
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Task not found", data: null });
    }
    return res.json({
      success: true,
      message: "Task deleted",
      data: { _id: deleted._id, task: deleted.task }
    });
  } catch (err) {
    console.error("delete task error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete task", data: null });
  }
});

// GET /logs — fetch latest action logs
app.get("/logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const logs = await getLogs(limit);
    return res.json({
      success: true,
      message: "Logs fetched",
      data: { count: logs.length, logs }
    });
  } catch (err) {
    console.error("get logs error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve logs", data: null });
  }
});

// POST /transcribe — receive browser audio, forward to Python Whisper server
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No audio file provided", text: "" });
  }

  try {
    // Use Node 18+ native FormData + Blob to forward the buffer without extra deps
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    form.append("file", blob, req.file.originalname || "recording.webm");

    const whisperRes = await fetch("http://localhost:8000/transcribe", {
      method: "POST",
      body: form,
    });

    if (!whisperRes.ok) {
      throw new Error(`Whisper server responded with ${whisperRes.status}`);
    }

    const { text } = await whisperRes.json();
    return res.json({ success: true, text: text ?? "" });

  } catch (err) {
    console.error("Transcription proxy error:", err.message);
    // Return a safe empty response — never crash the main server
    return res.status(503).json({
      success: false,
      message: "Transcription service unavailable. Is whisper_server.py running?",
      text: "",
    });
  }
});

// GET /contacts — list all contacts
app.get("/contacts", (req, res) => {
  try {
    const raw = loadContactsRaw();
    const contacts = Object.entries(raw).map(([key, val]) => ({
      name: key,
      displayName: typeof val === "string"
        ? key.charAt(0).toUpperCase() + key.slice(1)
        : (val.displayName || key.charAt(0).toUpperCase() + key.slice(1)),
      email: typeof val === "string" ? val : val.email,
    }));
    return res.json({ success: true, message: "Contacts fetched", data: { contacts } });
  } catch (err) {
    console.error("get contacts error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch contacts", data: { contacts: [] } });
  }
});

// POST /contacts — add or update a contact
app.post("/contacts", (req, res) => {
  const { name, email, displayName } = req.body;
  if (!name || typeof name !== "string" || !email || typeof email !== "string") {
    return res.status(400).json({ success: false, message: "name and email are required", data: null });
  }
  try {
    const raw = loadContactsRaw();
    const key = name.toLowerCase().trim();
    raw[key] = {
      email: email.trim(),
      displayName: displayName?.trim() || name.charAt(0).toUpperCase() + name.slice(1),
    };
    saveContactsRaw(raw);
    return res.json({ success: true, message: "Contact saved", data: { name: key } });
  } catch (err) {
    console.error("save contact error:", err);
    return res.status(500).json({ success: false, message: "Failed to save contact", data: null });
  }
});

// DELETE /contacts/:name — remove a contact
app.delete("/contacts/:name", (req, res) => {
  const key = req.params.name.toLowerCase().trim();
  try {
    const raw = loadContactsRaw();
    if (!raw[key]) {
      return res.status(404).json({ success: false, message: "Contact not found", data: null });
    }
    delete raw[key];
    saveContactsRaw(raw);
    return res.json({ success: true, message: "Contact deleted", data: { name: key } });
  } catch (err) {
    console.error("delete contact error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete contact", data: null });
  }
});

// GET /events — Server-Sent Events stream for instant reminder notifications
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  sseClients.add(res);
  console.log("[SSE] Client connected:", sseClients.size);
  const keepalive = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(keepalive);
    sseClients.delete(res);
    console.log("[SSE] Client disconnected:", sseClients.size);
  });
});

// GET /scheduled — list in-memory scheduled jobs (reads activeJobs directly)
app.get("/scheduled", (req, res) => {
  try {
    console.log("Active jobs:", activeJobs.size);
    const jobs = Array.from(activeJobs.entries()).map(([id, job]) => ({
      id,
      type:  job.type === "interval" ? "cron" : "timeout",
      label: job.label,
      spec:  job.spec,
    }));
    return res.json({ success: true, message: "Scheduled jobs fetched", data: { jobs } });
  } catch (err) {
    console.error("get scheduled error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch scheduled jobs", data: { jobs: [] } });
  }
});

// DELETE /scheduled/:id — cancel and remove a scheduled job by ID
app.delete("/scheduled/:id", (req, res) => {
  const cancelled = cancelSchedule(req.params.id);
  if (cancelled) {
    return res.json({ success: true, message: "Job cancelled" });
  }
  return res.status(404).json({ success: false, message: "Job not found" });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  process.env.RUN_MODE = "server";
  ensureContactsFile();
  await connectDB();
  await restoreJobs(); // re-register persisted jobs after DB connects
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
