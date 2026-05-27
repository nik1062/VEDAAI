import path from "node:path";
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
        const allowedOrigins = [
          env.corsOrigin, 
          "http://localhost:5173", 
          "http://127.0.0.1:5173",
          "http://localhost:4173",
          "http://127.0.0.1:4173"
        ];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`CORS blocked request from origin: ${origin}`);
          callback(new Error("Not allowed by CORS"));
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

  // ROOT is the base dist folder
  const rootPath = path.resolve(process.cwd());
  const distPath = path.join(rootPath, "dist");
  
  // Serve static files (assets, etc.)
  app.use(express.static(distPath));

  // Handle SPA routing: serve index.html for any non-API routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    const indexPath = path.join(distPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`Failed to serve index.html from ${indexPath}:`, err);
        next();
      }
    });
  });

  app.use(notFoundMiddleware);
  app.use(errorBoundaryMiddleware);

  return {
    app,
    queueBundle,
  };
};
