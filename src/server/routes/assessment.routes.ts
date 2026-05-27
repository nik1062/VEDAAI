import { Router } from "express";
import type { AssessmentController } from "../controllers/AssessmentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { assessmentSourceUpload } from "../middleware/upload.middleware.js";

export const createAssessmentRouter = (
  controller: AssessmentController,
): Router => {
  const router = Router();

  router.post(
    "/",
    assessmentSourceUpload.single("sourceFile"),
    asyncHandler(controller.createAssessment),
  );

  router.get(
    "/jobs/:jobId",
    asyncHandler(controller.getGenerationJob),
  );

  router.get(
    "/:assessmentId",
    asyncHandler(controller.getAssessment),
  );

  return router;
};
