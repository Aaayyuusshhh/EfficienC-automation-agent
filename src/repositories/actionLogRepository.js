import ActionLog from "../models/ActionLog.js";

export async function createLog(data) {
  return await ActionLog.create(data);
}

export async function getLogs(limit = 20) {
  return await ActionLog.find().sort({ createdAt: -1 }).limit(limit);
}
