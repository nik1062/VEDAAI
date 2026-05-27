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
        // Allow common local development origins
        const allowedOrigins = [
          env.corsOrigin, 
          "http://localhost:5173", 
          "http://127.0.0.1:5173",
          "http://localhost:4173", // Vite preview
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

  // Serve static files from the dist/client directory (where Vite builds)
  const clientDistPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(clientDistPath));

  // Handle SPA routing: serve index.html for any non-API routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    // Try to serve index.html from dist
    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) {
        // If index.html is missing, it might be in a different subfolder or not built
        console.error("Failed to serve index.html:", err);
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
