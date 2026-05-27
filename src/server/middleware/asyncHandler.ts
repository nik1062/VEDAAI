import type { NextFunction, Request, RequestHandler, Response } from "express";

export const asyncHandler =
  <TRequest extends Request = Request>(
    handler: (
      request: TRequest,
      response: Response,
      next: NextFunction,
    ) => Promise<void>,
  ): RequestHandler =>
  (request, response, next): void => {
    void handler(request as TRequest, response, next).catch(next);
  };
