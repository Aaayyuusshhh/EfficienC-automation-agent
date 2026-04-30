import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  task:        { type: String,  required: true },
  dueTime:     { type: Date,    default: null },
  status:      { type: String,  default: "pending" },
  triggered:   { type: Boolean, default: false },
  isRecurring: { type: Boolean, default: false },
  createdAt:   { type: Date,    default: Date.now },
});

export default mongoose.model("Task", taskSchema);
