import mongoose from "mongoose";

const scheduledJobSchema = new mongoose.Schema({
  jobId:     { type: String, required: true, unique: true },
  type:      { type: String, enum: ["once", "recurring"], required: true },
  label:     { type: String, required: true },
  spec:      { type: String, required: true }, // ISO datetime (once) | cron expr (recurring)
  status:    { type: String, enum: ["active", "completed", "cancelled"], default: "active" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("ScheduledJob", scheduledJobSchema);
