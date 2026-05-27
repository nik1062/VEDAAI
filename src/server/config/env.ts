import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { parse } from "dotenv";

// HARD OVERRIDE: Manually read .env and force inject into process.env
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envConfig = parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

export interface RuntimeEnv {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly mongoUri: string;
  readonly corsOrigin: string;
  readonly redisUrl: string;
  readonly openAiApiKey: string;
  readonly openAiBaseUrl: string;
  readonly openAiModel: string;
  readonly assessmentQueueName: "assessment-generation";
  readonly assessmentWorkerConcurrency: number;
}

const readOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const readRequiredEnv = (key: string): string => {
  const value = readOptionalEnv(key);

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const readPositiveIntegerEnv = (key: string, fallback: number): number => {
  const rawValue = readOptionalEnv(key);

  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsedValue;
};

const readNodeEnv = (): RuntimeEnv["nodeEnv"] => {
  const value = readOptionalEnv("NODE_ENV") ?? "development";

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error("NODE_ENV must be development, test, or production.");
};

export const loadRuntimeEnv = (): RuntimeEnv => ({
  nodeEnv: readNodeEnv(),
  port: readPositiveIntegerEnv("PORT", 4000),
  mongoUri: readRequiredEnv("MONGODB_URI"),
  corsOrigin: readOptionalEnv("CORS_ORIGIN") ?? "http://localhost:5173",
  redisUrl: readOptionalEnv("REDIS_URL") ?? "redis://127.0.0.1:6379",
  openAiApiKey: readRequiredEnv("OPENAI_API_KEY"),
  openAiBaseUrl: readOptionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
  openAiModel: readOptionalEnv("OPENAI_MODEL") ?? "gpt-4o-2024-08-06",
  assessmentQueueName: "assessment-generation",
  assessmentWorkerConcurrency: readPositiveIntegerEnv(
    "ASSESSMENT_WORKER_CONCURRENCY",
    4,
  ),
});
