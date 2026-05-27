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

  // Relax CSP for debugging and fix 'eval' errors
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline' wss: ws:; img-src * data: blob:; frame-src *; style-src * 'unsafe-inline';"
    );
    next();
  });

  app.use(
    cors({
      origin: true, 
      credentials: true,
      methods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "x-owner-id", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use("/api/health", createHealthRouter());
  app.use("/api/debug", (_req, res) => {
    const distPath = path.resolve(__dirname, "..");
    const rootDist = path.join(process.cwd(), "dist");
    res.json({
      cwd: process.cwd(),
      dirname: __dirname,
      distPath,
      rootDist,
      distExists: fs.existsSync(distPath),
      rootDistExists: fs.existsSync(rootDist),
      env: env.nodeEnv
    });
  });
  app.use("/api/assessments", createAssessmentRouter(assessmentController));

  // Determine dist path robustly
  let distPath = path.resolve(__dirname, "..");
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    distPath = path.join(process.cwd(), "dist");
  }
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

  // 1. Serve static files with caching for assets
  app.use(express.static(distPath, {
    maxAge: "1d",
    index: false
  }));

  // 2. Handle SPA routing with cache disabling for index.html
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      if (fs.existsSync(indexPath)) {
        // Force browser to fetch new index.html every time
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return res.sendFile(indexPath);
      } else {
        console.error(`[App] SPA Routing failed: ${indexPath} not found`);
        return res.status(404).send("Frontend build not found. Please run 'npm run build'.");
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
