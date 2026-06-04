import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CallbackSource, RawEventStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/persistence/prisma.service';

describe('Backend assignment API', () => {
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

  it('deduplicates PSP callbacks with persistent idempotency', async () => {
    const payload = {
      eventId: 'psp_evt_dup_1',
      type: 'payment.succeeded',
      data: {
        paymentId: 'pay_123',
        amount: '100.00',
        currency: 'EUR',
      },
    };

    const first = await request(app.getHttpServer())
      .post('/webhooks/psp/mock-pay')
      .set('X-Brand-Id', 'brandA')
      .set('X-Webhook-Event-Id', 'psp_evt_dup_1')
      .send(payload)
      .expect(202);

    expect(first.body.data).toMatchObject({
      duplicate: false,
      source: CallbackSource.PSP,
      provider: 'mock-pay',
      idempotencyKey: 'psp_evt_dup_1',
    });
    expect(first.body.meta.requestId).toBeDefined();

    const second = await request(app.getHttpServer())
      .post('/webhooks/psp/mock-pay')
      .set('X-Brand-Id', 'brandA')
      .set('X-Webhook-Event-Id', 'psp_evt_dup_1')
      .send(payload)
      .expect(200);

    expect(second.body.data).toMatchObject({
      duplicate: true,
      source: CallbackSource.PSP,
      provider: 'mock-pay',
      idempotencyKey: 'psp_evt_dup_1',
      firstRawEventId: first.body.data.rawEventId,
    });

    const pendingCount = await prisma.rawEvent.count({
      where: {
        brandId: 'brandA',
        source: CallbackSource.PSP,
        provider: 'mock-pay',
        idempotencyKey: 'psp_evt_dup_1',
        status: RawEventStatus.PENDING,
      },
    });
    const duplicateCount = await prisma.rawEvent.count({
      where: {
        brandId: 'brandA',
        source: CallbackSource.PSP,
        provider: 'mock-pay',
        idempotencyKey: 'psp_evt_dup_1',
        status: RawEventStatus.DUPLICATE,
      },
    });
    const idempotency = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        brandId_source_provider_key: {
          brandId: 'brandA',
          source: CallbackSource.PSP,
          provider: 'mock-pay',
          key: 'psp_evt_dup_1',
        },
      },
    });

    expect(pendingCount).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(idempotency.duplicateCount).toBe(1);
    expect(idempotency.firstRawEventId).toBe(first.body.data.rawEventId);
  });

  it('returns a structured error when X-Brand-Id is missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'Password123!',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'BRAND_ID_REQUIRED',
          message: 'X-Brand-Id header is required',
        });
        expect(body.error.requestId).toBeDefined();
      });
  });

  it('rejects a brand A token used with brand B', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Brand-Id', 'brandA')
      .send({
        email: 'Alice@Example.com',
        password: 'Password123!',
      })
      .expect(201);

    expect(register.body.data.user).toMatchObject({
      brandId: 'brandA',
      email: 'alice@example.com',
    });

    await request(app.getHttpServer())
      .get('/profile/me')
      .set('X-Brand-Id', 'brandB')
      .set('Authorization', `Bearer ${register.body.data.session.accessToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('TENANT_MISMATCH');
        expect(body.error.requestId).toBeDefined();
      });
  });

  it('scopes callback idempotency by brand', async () => {
    const payload = { eventId: 'shared_evt_1', type: 'round.finished' };

    await request(app.getHttpServer())
      .post('/webhooks/gsp/mock-game')
      .set('X-Brand-Id', 'brandA')
      .set('X-Webhook-Event-Id', 'shared_evt_1')
      .send(payload)
      .expect(202)
      .expect(({ body }) => {
        expect(body.data.duplicate).toBe(false);
      });

    await request(app.getHttpServer())
      .post('/webhooks/gsp/mock-game')
      .set('X-Brand-Id', 'brandB')
      .set('X-Webhook-Event-Id', 'shared_evt_1')
      .send(payload)
      .expect(202)
      .expect(({ body }) => {
        expect(body.data.duplicate).toBe(false);
      });

    const pendingEvents = await prisma.rawEvent.findMany({
      where: {
        source: CallbackSource.GSP,
        provider: 'mock-game',
        idempotencyKey: 'shared_evt_1',
        status: RawEventStatus.PENDING,
      },
      orderBy: {
        brandId: 'asc',
      },
    });

    expect(pendingEvents.map((event) => event.brandId)).toEqual(['brandA', 'brandB']);
  });
});
