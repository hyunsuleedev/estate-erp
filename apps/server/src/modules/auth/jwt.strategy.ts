import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthTokenPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'fallback-secret',
    });
  }

  validate(payload: AuthTokenPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('유효한 액세스 토큰이 아닙니다.');
    }

    return {
      userId: payload.sub,
      officeId: payload.officeId,
      role: payload.role,
    };
  }
}
