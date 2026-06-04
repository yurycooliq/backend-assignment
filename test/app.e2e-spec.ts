import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CallbackSource, RawEventStatus } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/persistence/prisma.service";

type TestResponse = request.Response & {
  body: {
    data?: any;
    error?: any;
    meta?: any;
  };
};

describe("Backend assignment API", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.rawEvent.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns health without requiring a brand header", async () => {
    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect(({ body }: TestResponse) => {
        expect(body.data).toEqual({ status: "ok" });
        expect(body.meta.requestId).toBeDefined();
      });
  });

  it("deduplicates PSP callbacks with persistent idempotency", async () => {
    const payload = {
      eventId: "psp_evt_dup_1",
      type: "payment.succeeded",
      data: {
        paymentId: "pay_123",
        amount: "100.00",
        currency: "EUR",
      },
    };

    const first = await request(app.getHttpServer())
      .post("/webhooks/psp/mock-pay")
      .set("X-Brand-Id", "brandA")
      .set("X-Webhook-Event-Id", "psp_evt_dup_1")
      .set("Authorization", "Bearer webhook-secret")
      .set("Cookie", "session=should-not-persist")
      .send(payload)
      .expect(202);

    expect(first.body.data).toMatchObject({
      duplicate: false,
      source: CallbackSource.PSP,
      provider: "mock-pay",
      idempotencyKey: "psp_evt_dup_1",
    });
    expect(first.body.meta.requestId).toBeDefined();

    const firstRawEvents = await prisma.rawEvent.findMany({
      where: {
        brandId: "brandA",
        source: CallbackSource.PSP,
        provider: "mock-pay",
        idempotencyKey: "psp_evt_dup_1",
        status: RawEventStatus.PENDING,
      },
    });
    expect(firstRawEvents).toHaveLength(1);
    expect(firstRawEvents[0]?.payload).toEqual(payload);

    const persistedHeaders = firstRawEvents[0]?.headers as Record<
      string,
      unknown
    >;
    expect(persistedHeaders["x-webhook-event-id"]).toBe("psp_evt_dup_1");
    expect(String(persistedHeaders["content-type"])).toContain(
      "application/json",
    );
    expect(persistedHeaders).not.toHaveProperty("authorization");
    expect(persistedHeaders).not.toHaveProperty("cookie");

    const second = await request(app.getHttpServer())
      .post("/webhooks/psp/mock-pay")
      .set("X-Brand-Id", "brandA")
      .set("X-Webhook-Event-Id", "psp_evt_dup_1")
      .send(payload)
      .expect(200);

    expect(second.body.data).toMatchObject({
      duplicate: true,
      source: CallbackSource.PSP,
      provider: "mock-pay",
      idempotencyKey: "psp_evt_dup_1",
      firstRawEventId: first.body.data.rawEventId,
    });

    const pendingCount = await prisma.rawEvent.count({
      where: {
        brandId: "brandA",
        source: CallbackSource.PSP,
        provider: "mock-pay",
        idempotencyKey: "psp_evt_dup_1",
        status: RawEventStatus.PENDING,
      },
    });
    const duplicateCount = await prisma.rawEvent.count({
      where: {
        brandId: "brandA",
        source: CallbackSource.PSP,
        provider: "mock-pay",
        idempotencyKey: "psp_evt_dup_1",
        status: RawEventStatus.DUPLICATE,
      },
    });
    const idempotency = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        brandId_source_provider_key: {
          brandId: "brandA",
          source: CallbackSource.PSP,
          provider: "mock-pay",
          key: "psp_evt_dup_1",
        },
      },
    });

    expect(pendingCount).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(idempotency.duplicateCount).toBe(1);
    expect(idempotency.firstRawEventId).toBe(first.body.data.rawEventId);
  });

  it("stores provider event id separately from the resolved idempotency key", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/psp/mock-pay")
      .set("X-Brand-Id", "brandA")
      .set("Idempotency-Key", "idem_123")
      .send({
        eventId: "provider_evt_456",
        type: "payment.succeeded",
      })
      .expect(202)
      .expect(({ body }: TestResponse) => {
        expect(body.data.idempotencyKey).toBe("idem_123");
      });

    const rawEvent = await prisma.rawEvent.findFirstOrThrow({
      where: {
        brandId: "brandA",
        source: CallbackSource.PSP,
        provider: "mock-pay",
      },
    });

    expect(rawEvent.idempotencyKey).toBe("idem_123");
    expect(rawEvent.providerEventId).toBe("provider_evt_456");
  });

  it("returns a structured error when X-Brand-Id is missing", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "alice@example.com",
        password: "Password123!",
      })
      .expect(400)
      .expect(({ body }: TestResponse) => {
        expect(body.error).toMatchObject({
          code: "BRAND_ID_REQUIRED",
          message: "X-Brand-Id header is required",
        });
        expect(body.error.requestId).toBeDefined();
      });
  });

  it.each(["brand A", "a".repeat(65)])(
    "rejects invalid X-Brand-Id: %s",
    async (brandId) => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("X-Brand-Id", brandId)
        .send({
          email: "alice@example.com",
          password: "Password123!",
        })
        .expect(400)
        .expect(({ body }: TestResponse) => {
          expect(body.error.code).toBe("INVALID_BRAND_ID");
          expect(body.error.requestId).toBeDefined();
        });
    },
  );

  it("rejects invalid webhook provider slugs", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/psp/Stripe")
      .set("X-Brand-Id", "brandA")
      .set("X-Webhook-Event-Id", "provider_validation_evt_1")
      .send({ eventId: "provider_validation_evt_1", type: "payment.succeeded" })
      .expect(400)
      .expect(({ body }: TestResponse) => {
        expect(body.error.code).toBe("INVALID_PROVIDER");
        expect(body.error.requestId).toBeDefined();
      });
  });

  it("rejects overlong idempotency keys", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/psp/mock-pay")
      .set("X-Brand-Id", "brandA")
      .set("X-Webhook-Event-Id", "x".repeat(129))
      .send({ type: "payment.succeeded" })
      .expect(400)
      .expect(({ body }: TestResponse) => {
        expect(body.error.code).toBe("INVALID_IDEMPOTENCY_KEY");
        expect(body.error.requestId).toBeDefined();
      });
  });

  it("rejects callbacks without a stable idempotency key before persistence", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/psp/mock-pay")
      .set("X-Brand-Id", "brandA")
      .send({
        type: "payment.succeeded",
        data: {
          paymentId: "pay_missing_idem_1",
        },
      })
      .expect(400)
      .expect(({ body }: TestResponse) => {
        expect(body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
        expect(body.error.requestId).toBeDefined();
      });

    await expect(prisma.rawEvent.count()).resolves.toBe(0);
    await expect(prisma.idempotencyKey.count()).resolves.toBe(0);
  });

  it("registers, logs in, and returns the authenticated brand profile", async () => {
    const credentials = {
      email: "Alice@Example.com",
      password: "Password123!",
    };

    const register = await request(app.getHttpServer())
      .post("/auth/register")
      .set("X-Brand-Id", "brandA")
      .send(credentials)
      .expect(201);

    expect(register.body.data.user).toMatchObject({
      brandId: "brandA",
      email: "alice@example.com",
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Brand-Id", "brandA")
      .send(credentials)
      .expect(200);

    expect(login.body.data.user).toEqual(register.body.data.user);

    await request(app.getHttpServer())
      .get("/profile/me")
      .set("X-Brand-Id", "brandA")
      .set("Authorization", `Bearer ${login.body.data.session.accessToken}`)
      .expect(200)
      .expect(({ body }: TestResponse) => {
        expect(body.data).toEqual({
          id: register.body.data.user.id,
          brandId: "brandA",
          email: "alice@example.com",
        });
      });
  });

  it("scopes registered user email uniqueness by brand", async () => {
    const credentials = {
      email: "alice@example.com",
      password: "Password123!",
    };

    await request(app.getHttpServer())
      .post("/auth/register")
      .set("X-Brand-Id", "brandA")
      .send(credentials)
      .expect(201)
      .expect(({ body }: TestResponse) => {
        expect(body.data.user).toMatchObject({
          brandId: "brandA",
          email: "alice@example.com",
        });
      });

    await request(app.getHttpServer())
      .post("/auth/register")
      .set("X-Brand-Id", "brandB")
      .send(credentials)
      .expect(201)
      .expect(({ body }: TestResponse) => {
        expect(body.data.user).toMatchObject({
          brandId: "brandB",
          email: "alice@example.com",
        });
      });

    await request(app.getHttpServer())
      .post("/auth/register")
      .set("X-Brand-Id", "brandA")
      .send(credentials)
      .expect(409)
      .expect(({ body }: TestResponse) => {
        expect(body.error.code).toBe("USER_ALREADY_EXISTS");
        expect(body.error.requestId).toBeDefined();
      });
  });

  it("rejects a brand A token used with brand B", async () => {
    const register = await request(app.getHttpServer())
      .post("/auth/register")
      .set("X-Brand-Id", "brandA")
      .send({
        email: "Alice@Example.com",
        password: "Password123!",
      })
      .expect(201);

    expect(register.body.data.user).toMatchObject({
      brandId: "brandA",
      email: "alice@example.com",
    });

    await request(app.getHttpServer())
      .get("/profile/me")
      .set("X-Brand-Id", "brandB")
      .set("Authorization", `Bearer ${register.body.data.session.accessToken}`)
      .expect(403)
      .expect(({ body }: TestResponse) => {
        expect(body.error.code).toBe("TENANT_MISMATCH");
        expect(body.error.requestId).toBeDefined();
      });
  });

  it("scopes callback idempotency by brand", async () => {
    const payload = { eventId: "shared_evt_1", type: "round.finished" };

    await request(app.getHttpServer())
      .post("/webhooks/gsp/mock-game")
      .set("X-Brand-Id", "brandA")
      .set("X-Webhook-Event-Id", "shared_evt_1")
      .send(payload)
      .expect(202)
      .expect(({ body }: TestResponse) => {
        expect(body.data.duplicate).toBe(false);
      });

    await request(app.getHttpServer())
      .post("/webhooks/gsp/mock-game")
      .set("X-Brand-Id", "brandB")
      .set("X-Webhook-Event-Id", "shared_evt_1")
      .send(payload)
      .expect(202)
      .expect(({ body }: TestResponse) => {
        expect(body.data.duplicate).toBe(false);
      });

    const pendingEvents = await prisma.rawEvent.findMany({
      where: {
        source: CallbackSource.GSP,
        provider: "mock-game",
        idempotencyKey: "shared_evt_1",
        status: RawEventStatus.PENDING,
      },
      orderBy: {
        brandId: "asc",
      },
    });

    expect(pendingEvents.map((event) => event.brandId)).toEqual([
      "brandA",
      "brandB",
    ]);
  });

  it("handles concurrent duplicate callbacks without creating multiple pending events", async () => {
    const eventId = "concurrent_evt_1";
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        request(app.getHttpServer())
          .post("/webhooks/psp/mock-pay")
          .set("X-Brand-Id", "brandA")
          .set("X-Webhook-Event-Id", eventId)
          .set("X-Correlation-Id", `concurrent-${index}`)
          .send({
            eventId: "provider_concurrent_evt_1",
            type: "payment.succeeded",
          }),
      ),
    );

    expect(
      responses.filter((response: request.Response) => response.status === 202),
    ).toHaveLength(1);
    expect(
      responses.filter((response: request.Response) => response.status === 200),
    ).toHaveLength(4);
    expect(
      responses
        .filter((response: request.Response) => response.status === 200)
        .every((response: TestResponse) => response.body.data.duplicate),
    ).toBe(true);

    const rawEvents = await prisma.rawEvent.findMany({
      where: {
        brandId: "brandA",
        source: CallbackSource.PSP,
        provider: "mock-pay",
        idempotencyKey: eventId,
      },
    });
    const idempotency = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        brandId_source_provider_key: {
          brandId: "brandA",
          source: CallbackSource.PSP,
          provider: "mock-pay",
          key: eventId,
        },
      },
    });

    expect(
      rawEvents.filter((event) => event.status === RawEventStatus.PENDING),
    ).toHaveLength(1);
    expect(
      rawEvents.filter((event) => event.status === RawEventStatus.DUPLICATE),
    ).toHaveLength(4);
    expect(idempotency.duplicateCount).toBe(4);
  });
});
