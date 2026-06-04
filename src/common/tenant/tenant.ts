import { ApplicationError } from "../errors/application-error";
import { RequestWithContext } from "../http/request-context";

export function requireBrandId(request: RequestWithContext): string {
  const brandId = request.requestContext?.brandId;

  if (!brandId) {
    throw ApplicationError.badRequest(
      "BRAND_ID_REQUIRED",
      "X-Brand-Id header is required",
    );
  }

  return brandId;
}
