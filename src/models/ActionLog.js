import mongoose from "mongoose";

const actionLogSchema = new mongoose.Schema({
  type:      { type: String, enum: ["task", "email", "meeting", "system"], required: true },
  title:     { type: String, required: true },
  details:   { type: String, default: "" },
  status:    { type: String, enum: ["success", "failed"], required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("ActionLog", actionLogSchema);
