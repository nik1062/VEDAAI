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

  const distPath = path.resolve(process.cwd(), "dist");
  
  // 1. Serve static files (css, js, images)
  app.use(express.static(distPath));

  // 2. Handle SPA routing for any other GET requests that are not API calls
  app.get("/:path*", (req, res, next) => {
    // If it's an API route, don't serve index.html, let it fall through to 404
    if (req.path.startsWith("/api")) {
      return next();
    }
    
    // Serve index.html for all other routes to support client-side routing
    const indexPath = path.join(distPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        // If index.html is actually missing, pass to error handler
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
