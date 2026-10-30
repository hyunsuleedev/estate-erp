import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyToken } from "@clerk/backend";
// Consumer authentication never provisions ERP User records or office membership.
@Injectable()
export class ConsumerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const secretKey = this.config.get<string>("CLERK_SECRET_KEY");
    const authorizedParties = this.config
      .get<string>("CATALOG_AUTH_ORIGINS")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!secretKey || !authorizedParties?.length)
      throw new ServiceUnavailableException(
        "소비자 로그인 연결을 준비 중입니다.",
      );
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer "))
      throw new UnauthorizedException();
    try {
      const claims = await verifyToken(header.slice(7), {
        secretKey,
        authorizedParties,
      });
      if (!claims.sub) throw new Error();
      req.consumerId = claims.sub;
      return true;
    } catch {
      throw new UnauthorizedException(
        "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      );
    }
  }
}
