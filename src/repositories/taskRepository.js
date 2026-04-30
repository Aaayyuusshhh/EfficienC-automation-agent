import Task from "../models/Task.js";

export async function createTask(data) {
  if (!data?.task || typeof data.task !== "string" || data.task.trim().length === 0) {
    throw new Error("task is required and must be a non-empty string");
  }
  return await Task.create(data);
}

export async function getAllTasks() {
  return await Task.find().sort({ createdAt: -1 });
}

export async function getTasksFiltered(filter = {}) {
  return await Task.find(filter).sort({ createdAt: -1 });
}

export async function completeTask(taskName) {
  if (!taskName) return null;
  const escaped = taskName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return await Task.findOneAndUpdate(
    { task: { $regex: escaped, $options: "i" }, status: "pending" },
    { status: "completed", triggered: true },
    { returnDocument: "after" }
  );
}

export async function deleteTask(taskName) {
  if (!taskName || typeof taskName !== "string" || taskName.trim().length === 0) {
    throw new Error("task is required and must be a non-empty string");
  }
  const escaped = taskName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return await Task.findOneAndDelete(
    { task: { $regex: escaped, $options: "i" } }
  );
}

export async function markTriggered(taskId) {
  return await Task.findByIdAndUpdate(taskId, { triggered: true });
}
