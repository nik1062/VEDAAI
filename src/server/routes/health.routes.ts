import { Router } from "express";

export const createHealthRouter = (): Router => {
  const router = Router();

  router.get("/", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "vedaai-api",
    });
  });

  return router;
};
