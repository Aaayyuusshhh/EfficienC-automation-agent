const WEBHOOK_URL = "http://localhost:5678/webhook/task-completed";
const WEBHOOK_TIMEOUT_MS = 2000;

async function sendWebhook(task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: task.task,
        _id: task._id,
        status: "completed",
        createdAt: task.createdAt
      }),
      signal: controller.signal
    });
    console.log(`[AUTOMATION] Sent to n8n: ${task.task}`);
  } catch (err) {
    console.error(`[AUTOMATION ERROR] Failed to send webhook: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export function handleTaskCompleted(task) {
  // Fire-and-forget — does not block execution pipeline
  sendWebhook(task).catch(() => {});
}
