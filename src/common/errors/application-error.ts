import { HttpStatus } from "@nestjs/common";

export class ApplicationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  static badRequest(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): ApplicationError {
    return new ApplicationError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): ApplicationError {
    return new ApplicationError(
      HttpStatus.UNAUTHORIZED,
      code,
      message,
      details,
    );
  }

  static forbidden(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): ApplicationError {
    return new ApplicationError(HttpStatus.FORBIDDEN, code, message, details);
  }

  static conflict(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): ApplicationError {
    return new ApplicationError(HttpStatus.CONFLICT, code, message, details);
  }

  static validation(
    message: string,
    details: Record<string, unknown> = {},
  ): ApplicationError {
    return new ApplicationError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "VALIDATION_FAILED",
      message,
      details,
    );
  }
}
