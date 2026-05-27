import mongoose from "mongoose";
import type { RuntimeEnv } from "../config/env.js";

export const connectMongo = async (env: RuntimeEnv): Promise<void> => {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== "production",
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
  });
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
