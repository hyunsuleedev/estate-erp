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

  private resolveSource(request: Request): RequestSource {
    const header = request.header('x-estate-source');

    if (header === 'mcp' || header === 'system') {
      return header;
    }

    return 'web';
  }
}
