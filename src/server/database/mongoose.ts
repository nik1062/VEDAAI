import mongoose from "mongoose";
import type { RuntimeEnv } from "../config/env.js";

export const connectMongo = async (env: RuntimeEnv): Promise<void> => {
  mongoose.set("strictQuery", true);

  const maskedUri = env.mongoUri.replace(
    /mongodb\+srv:\/\/([^:]+):[^@]+@/,
    "mongodb+srv://$1:****@",
  );
  console.log(`Connecting to MongoDB: ${maskedUri}`);

  try {
    await mongoose.connect(env.mongoUri, {
      autoIndex: env.nodeEnv !== "production",
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 15_000,
    });
    console.log("Successfully connected to MongoDB.");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
