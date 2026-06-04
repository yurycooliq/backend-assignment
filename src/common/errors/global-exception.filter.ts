import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApplicationError } from "./application-error";
import { RequestWithContext } from "../http/request-context";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & RequestWithContext>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestContext?.requestId ?? "req_unknown";
    const error = this.toErrorResponse(exception);

    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    });
  }

  private toErrorResponse(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details: Record<string, unknown>;
  } {
    if (exception instanceof ApplicationError) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === "object" &&
        response !== null &&
        "message" in response
          ? String((response as { message: unknown }).message)
          : exception.message;

      return {
        statusCode,
        code: this.defaultCodeForStatus(statusCode),
        message,
        details: {},
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      details: {},
    };
  }

  private defaultCodeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "VALIDATION_FAILED";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }
}
