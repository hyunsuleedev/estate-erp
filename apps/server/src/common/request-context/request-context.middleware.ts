import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  RequestSource,
  runWithRequestContext,
} from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const source = this.resolveSource(request);

    runWithRequestContext(
      {
        source,
        actor:
          source === 'mcp'
            ? 'mcp:claude'
            : source === 'system'
              ? 'system:rule_engine'
              : 'user',
      },
      () => next(),
    );
  }

  /**
   * 변경 기록(ActivityLog)에 남는 출처. 요청이 보낸 머리글로 정하지 않는다 — 예전에는 `x-estate-source` 머리글을
   * 그대로 믿어, 누구나 자기 변경을 "system"이나 "mcp"로 적히게 할 수 있었고 MCP의 변경은 "web"으로 남았다.
   * `/mcp`로 들어온 요청은 MCP이고(인증을 통과하면 McpAuthGuard가 다시 한 번 못박는다), 그 밖의 HTTP 요청은 화면이다.
   * `/mcp/api-key`(키 발급 · 폐기)는 앱 화면이 로그인 토큰으로 부르는 것이라 화면의 요청이다.
   * "system"은 HTTP로 들어오지 않는 서버 안의 작업(규칙 엔진 등)이 스스로 정한다.
   */
  private resolveSource(request: Request): RequestSource {
    // 미들웨어가 붙는 자리에 따라 request.path는 앞부분이 잘려 올 수 있다. 처음 요청된 주소로 본다.
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0].replace(/\/+$/, '');
    return path === '/mcp' ? 'mcp' : 'web';
  }
}
