import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { getEnvConfig } from '@sopon/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const config = getEnvConfig();

  const fastifyAdapter = new FastifyAdapter({
    logger: false,
    trustProxy: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    {
      bufferLogs: true,
    },
  );

  // Security Headers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: false,
  });

  // CORS Configuration
  const allowedOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global prefixes and filters
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SopON API')
    .setDescription('Multi-tenant AI-powered incident & operations platform API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Health & Monitoring')
    .addTag('Authentication')
    .addTag('Organizations')
    .addTag('Incidents')
    .addTag('Knowledge & RAG')
    .addTag('Ingestion')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.PORT || 4000;
  await app.listen(port, '0.0.0.0');

  logger.log(`SopON API service running on: http://localhost:${port}/api`);
  logger.log(`OpenAPI Documentation: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal error starting SopON API:', err);
  process.exit(1);
});
