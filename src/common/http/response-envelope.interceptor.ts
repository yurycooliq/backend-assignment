import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RequestWithContext } from './request-context';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return next.handle().pipe(
      map((data: unknown) => ({
        data: data ?? {},
        meta: {
          requestId: request.requestContext?.requestId ?? 'req_unknown',
        },
      })),
    );
  }
}
