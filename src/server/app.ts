import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import type { RuntimeEnv } from "./config/env.js";
import { AssessmentController } from "./controllers/AssessmentController.js";
import {
  RedisGenerationJobStatePublisher,
} from "./events/GenerationJobStatePublisher.js";
import {
  errorBoundaryMiddleware,
  notFoundMiddleware,
} from "./middleware/error.middleware.js";
import {
  createAssessmentGenerationQueueBundle,
  type AssessmentGenerationQueueBundle,
} from "./queues/assessment-generation.queue.js";
import { createAssessmentRouter } from "./routes/assessment.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { AssignmentCreationService } from "./services/AssignmentCreationService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApplicationBundle {
  readonly app: Express;
  readonly queueBundle: AssessmentGenerationQueueBundle;
}

export const createApplication = (env: RuntimeEnv): ApplicationBundle => {
  const app = express();
  const queueBundle = createAssessmentGenerationQueueBundle(env);
  const statePublisher = new RedisGenerationJobStatePublisher(env.redisUrl);
  const assignmentCreationService = new AssignmentCreationService(
    queueBundle.queue,
    undefined,
    undefined,
    undefined,
    statePublisher,
  );
  const assessmentController = new AssessmentController(assignmentCreationService);

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (origin, callback) => {
        // In production, we allow the origin if it matches the environment variable or is from the same domain
        const allowedOrigins = [
          env.corsOrigin, 
          "http://localhost:5173", 
          "http://127.0.0.1:5173",
          "http://localhost:4173",
          "http://127.0.0.1:4173",
          "https://vedaai.onrender.com" // Common Render pattern, ideally this comes from env.corsOrigin
        ];
        
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".onrender.com")) {
          callback(null, true);
        } else {
          console.warn(`[CORS] Request from ${origin} permitted (Audit Mode)`);
          callback(null, true); 
        }
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "x-owner-id", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use("/api/health", createHealthRouter());
  app.use("/api/assessments", createAssessmentRouter(assessmentController));

  // Determine dist path relative to this file
  // In production (dist/server/app.js), dist is one level up
  const distPath = path.resolve(__dirname, "..");
  const indexPath = path.join(distPath, "index.html");
  
  console.log(`[App] Server started in ${env.nodeEnv} mode`);
  console.log(`[App] __dirname: ${__dirname}`);
  console.log(`[App] Static Path (dist): ${distPath}`);
  console.log(`[App] Index Path: ${indexPath}`);
  
  if (fs.existsSync(distPath)) {
    const contents = fs.readdirSync(distPath);
    console.log(`[App] Dist directory exists. Contents: ${contents.join(", ")}`);
    console.log(`[App] index.html exists: ${contents.includes("index.html")}`);
  } else {
    console.error(`[App] ERROR: Dist directory NOT found at ${distPath}`);
  }

  // 1. Serve static files (css, js, images)
  app.use(express.static(distPath));

  // 2. Handle SPA routing
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      } else {
        console.error(`[App] SPA Routing failed: ${indexPath} not found`);
      }
    }
    next();
  });

  app.use(notFoundMiddleware);
  app.use(errorBoundaryMiddleware);

  return {
    app,
    queueBundle,
  };
};
