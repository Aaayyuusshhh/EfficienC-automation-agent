import mongoose from "mongoose";

export async function connectDB() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not defined");
        }

        await mongoose.connect(process.env.MONGO_URI, {
            dbName: "ai_copilot"
        });

        console.log("MongoDB connected successfully");

    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        process.exit(1);
    }
}