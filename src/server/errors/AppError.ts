export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    expose = statusCode < 500,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

export const isErrorWithMessage = (error: unknown): error is Error =>
  error instanceof Error;
