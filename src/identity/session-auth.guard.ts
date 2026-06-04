import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/errors/application-error';
import { RequestWithContext } from '../common/http/request-context';
import { requireBrandId } from '../common/tenant/tenant';
import { SessionService } from './session.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const brandId = requireBrandId(request);
    const accessToken = this.extractBearerToken(request.headers.authorization);
    const session = await this.sessionService.authenticate(brandId, accessToken);

    request.auth = {
      sessionId: session.id,
      userId: session.userId,
    };

    return true;
  }

  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw ApplicationError.unauthorized('AUTH_TOKEN_REQUIRED', 'Authorization bearer token is required');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApplicationError.unauthorized('AUTH_TOKEN_REQUIRED', 'Authorization bearer token is required');
    }

    return token;
  }
}
