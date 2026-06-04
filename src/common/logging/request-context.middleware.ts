import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestWithContext } from '../http/request-context';
import { normalizeBrandId } from '../validation/request-values';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(request: Request & RequestWithContext, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const requestId = this.firstHeader(request, 'X-Correlation-Id') ?? this.firstHeader(request, 'X-Request-Id') ?? `req_${randomUUID()}`;
    const rawBrandId = this.firstHeader(request, 'X-Brand-Id');

    request.requestContext = {
      requestId,
    };

    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Correlation-Id', requestId);
    response.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          brandId: request.requestContext?.brandId ?? null,
          method: request.method,
          path: request.originalUrl || request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    if (rawBrandId !== undefined || this.requiresBrand(request)) {
      request.requestContext.brandId = normalizeBrandId(rawBrandId);
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
    const path = (request.originalUrl || request.url || request.path).split('?')[0];

    return !path.startsWith('/docs') && path !== '/favicon.ico' && path !== '/health';
  }
}
