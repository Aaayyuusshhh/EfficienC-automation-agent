import type { Task } from "./components/TaskCard";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5000";

interface BackendTask {
  _id: string;
  task: string;
  status: "pending" | "completed";
  createdAt: string;
}

function mapTask(t: BackendTask): Task {
  return {
    id: t._id,
    title: t.task,
    status: t.status,
    createdAt: new Date(t.createdAt),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Request failed: ${path}`);
  }
  return json;
}

export async function getTasks(status: "pending" | "completed"): Promise<Task[]> {
  const json = await request<{ data: { tasks: BackendTask[] } }>(
    `/tasks?status=${status}`
  );
  return json.data.tasks.map(mapTask);
}

export async function sendCommand(input: string): Promise<{ explanation?: string; simulated_result?: string }> {
  const json = await request<{ explanation?: string; data?: { actions_executed?: Array<{ simulated_result?: string }> } }>("/command", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
  return {
    explanation: json.explanation ?? undefined,
    simulated_result: json.data?.actions_executed?.[0]?.simulated_result ?? undefined,
  };
}

export async function completeTask(name: string): Promise<void> {
  await request("/complete", {
    method: "POST",
    body: JSON.stringify({ task: name }),
  });
}

export async function deleteTask(name: string): Promise<void> {
  await request("/delete", {
    method: "POST",
    body: JSON.stringify({ task: name }),
  });
}

export interface ActionLog {
  _id: string;
  type: "task" | "email" | "meeting" | "system";
  title: string;
  details: string;
  status: "success" | "failed";
  createdAt: string;
}

export async function getLogs(): Promise<ActionLog[]> {
  const json = await request<{ data: { logs: ActionLog[] } }>("/logs");
  return json.data.logs;
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export interface Contact {
  name: string;
  displayName: string;
  email: string;
}

export async function getContacts(): Promise<Contact[]> {
  const json = await request<{ data: { contacts: Contact[] } }>("/contacts");
  return json.data.contacts;
}

export async function addContact(name: string, email: string, displayName?: string): Promise<void> {
  await request("/contacts", {
    method: "POST",
    body: JSON.stringify({ name, email, displayName }),
  });
}

export async function deleteContact(name: string): Promise<void> {
  await request(`/contacts/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ── Scheduled jobs ────────────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  type: "cron" | "timeout";
  label: string;
  spec: string;
}

export async function getScheduled(): Promise<ScheduledJob[]> {
  const json = await request<{ data: { jobs: ScheduledJob[] } }>("/scheduled");
  return json.data.jobs;
}

export async function deleteScheduled(id: string): Promise<void> {
  await request(`/scheduled/${encodeURIComponent(id)}`, { method: "DELETE" });
}
