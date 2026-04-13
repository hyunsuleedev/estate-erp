import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 외부 매물 배치 업서트에서 raw JSONB 페이로드가 커질 수 있어 body size 확장.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  // Swagger + Scalar API Docs
  const config = new DocumentBuilder()
    .setTitle('Estate ERP API')
    .setDescription('부동산 중개사 전용 SaaS ERP - API 문서')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  app.use(
    '/api-docs',
    apiReference({
      content: document,
      theme: 'default',
    }),
  );

  // 루트 접속 시 API 문서로 리다이렉트
  app.use('/', (req: any, res: any, next: any) => {
    if (req.originalUrl === '/') return res.redirect('/api-docs');
    next();
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Estate ERP server running on http://localhost:${port}`);
  console.log(`API Docs: http://localhost:${port}/api-docs`);
}
bootstrap();
