import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { ApplicationError } from '../errors/application-error';
import { RequestWithContext } from '../http/request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(request: Request & RequestWithContext, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const requestId = this.firstHeader(request, 'X-Correlation-Id') ?? this.firstHeader(request, 'X-Request-Id') ?? `req_${randomUUID()}`;
    const brandId = this.firstHeader(request, 'X-Brand-Id')?.trim();

    request.requestContext = {
      requestId,
      brandId: brandId || undefined,
    };

    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Correlation-Id', requestId);
    response.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          brandId: brandId || null,
          method: request.method,
          path: request.originalUrl || request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    if (this.requiresBrand(request) && !brandId) {
      throw ApplicationError.badRequest('BRAND_ID_REQUIRED', 'X-Brand-Id header is required');
    }

    next();
  }

  private firstHeader(request: Request, name: string): string | undefined {
    const value = request.header(name);

    if (!value) {
      return undefined;
    }

    return value;
  }

  private requiresBrand(request: Request): boolean {
    const path = request.path || request.url;

    return !path.startsWith('/docs') && path !== '/favicon.ico';
  }
}
