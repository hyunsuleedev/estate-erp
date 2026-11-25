import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 리버스 프록시(운영: Caddy) 뒤에서는 모든 요청이 프록시의 IP로 보인다. 그대로 두면 IP당 요청 제한
  // (ThrottlerGuard)이 모든 사용자를 한 사람으로 센다. 앞에 선 프록시 수만큼만 X-Forwarded-For를 믿는다.
  // 프록시 없이 직접 받는 환경(로컬)에서는 0이라 그 머리글을 믿지 않는다(믿으면 IP를 속여 제한을 피할 수 있다).
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  if (process.env.REDIS_URL) {
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis(process.env.REDIS_URL);
    app.useWebSocketAdapter(redisIoAdapter);
  }

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

  app.enableCors({
    // Mcp-Protocol-Version: 브라우저에서 도는 MCP 클라이언트가 /mcp 요청에 붙인다.
    allowedHeaders: ['Authorization', 'Content-Type', 'Mcp-Protocol-Version'],
    // WWW-Authenticate: 브라우저 MCP 클라이언트가 401에서 인가 서버 위치를 읽는다.
    exposedHeaders: ['Server-Timing', 'WWW-Authenticate'],
    maxAge: 600,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

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
