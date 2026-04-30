// NOTE: This storage uses MongoDB via Mongoose.
// Will be replaced with database layer (MongoDB) later — already using it.
import * as taskRepo from "../repositories/taskRepository.js";

export async function createTask({ task, dueTime, isRecurring }) {
  const newTask = await taskRepo.createTask({
    task,
    dueTime: dueTime || null,
    isRecurring: !!isRecurring
  });

  console.log("📝 Task saved:", newTask);
  return newTask;
}

export async function getAllTasks() {
  return await taskRepo.getAllTasks();
}

export async function getTasksFiltered(filter) {
  return await taskRepo.getTasksFiltered(filter);
}

export async function completeTask(taskName) {
  return await taskRepo.completeTask(taskName);
}

export async function deleteTask(taskName) {
  return await taskRepo.deleteTask(taskName);
}

export async function updateTask(taskId, data) {
  return await taskRepo.updateTask(taskId, data);
}

async function checkReminders() {
  const now = new Date();
  const allTasks = await taskRepo.getAllTasks();

  for (const task of allTasks) {
    if (!task.dueTime || task.triggered || task.status === "completed") continue;

    const due = new Date(task.dueTime);

    if (now >= due) {
      console.log(`⏰ Reminder: ${task.task}`);
      await taskRepo.markTriggered(task._id);
    }
  }
}

if (!global.__reminderIntervalStarted && process.env.RUN_MODE === "server") {
  setInterval(() => {
    checkReminders().catch(console.error);
  }, 60000);

  global.__reminderIntervalStarted = true;
}
