import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApplicationError } from './common/errors/application-error';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';

export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) =>
        ApplicationError.validation('Request validation failed', {
          fields: flattenValidationErrors(errors),
        }),
    }),
  );

  if (process.env.NODE_ENV !== 'test') {
    const config = new DocumentBuilder()
      .setTitle('Backend Callback MVP')
      .setDescription('Identity and PSP/GSP callback ingestion API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Brand-Id', in: 'header' }, 'brandId')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }
}

function flattenValidationErrors(errors: ValidationError[], parent = ''): Array<{ field: string; messages: string[] }> {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const current = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    const children = error.children?.length ? flattenValidationErrors(error.children, field) : [];

    return [...current, ...children];
  });
}
