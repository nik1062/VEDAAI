import type { ErrorRequestHandler, RequestHandler } from "express";
import { Error as MongooseError } from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { AppError, isErrorWithMessage } from "../errors/AppError.js";

interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export const notFoundMiddleware: RequestHandler = (_request, response) => {
  const notFoundError = new AppError(
    404,
    "ROUTE_NOT_FOUND",
    "The requested route was not found.",
  );

  response.status(notFoundError.statusCode).json({
    error: {
      code: notFoundError.code,
      message: notFoundError.message,
    },
  } satisfies ErrorResponseBody);
};

export const errorBoundaryMiddleware: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request payload failed validation.",
        details: error.flatten(),
      },
    } satisfies ErrorResponseBody);
    return;
  }

  if (error instanceof MongooseError.ValidationError) {
    response.status(422).json({
      error: {
        code: "MONGOOSE_VALIDATION_ERROR",
        message: error.message,
      },
    } satisfies ErrorResponseBody);
    return;
  }

  if (error instanceof multer.MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: {
        code: error.code,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Uploaded file cannot exceed 50 MB."
            : error.message,
      },
    } satisfies ErrorResponseBody);
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.expose ? error.message : "Internal server error.",
      },
    } satisfies ErrorResponseBody);
    return;
  }

  const message = isErrorWithMessage(error)
    ? error.message
    : "Unexpected server error.";

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message,
    },
  } satisfies ErrorResponseBody);
};
