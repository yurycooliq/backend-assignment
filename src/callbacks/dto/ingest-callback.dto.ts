import { CallbackSource } from "@prisma/client";
import { IncomingHttpHeaders } from "http";

export interface IngestCallbackInput {
  brandId: string;
  source: CallbackSource;
  provider: string;
  payload: unknown;
  headers: IncomingHttpHeaders;
  correlationId?: string;
}

export interface IngestCallbackResult {
  status: "accepted" | "duplicate_ignored";
  duplicate: boolean;
  source: CallbackSource;
  provider: string;
  idempotencyKey: string;
  rawEventId?: string;
  firstRawEventId?: string;
}
