import { Request } from "express";

export interface RequestContext {
  requestId: string;
  brandId?: string;
}

export interface AuthContext {
  sessionId: string;
  userId: string;
}

export interface RequestWithContext extends Request {
  requestContext?: RequestContext;
  auth?: AuthContext;
}
