import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthTokenPayload } from './auth.types';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_REFRESH_SECRET') ??
        config.get<string>('JWT_SECRET') ??
        'fallback-secret',
      passReqToCallback: true,
    });
  }

  validate(request: Request, payload: AuthTokenPayload) {
    const refreshToken = request.body?.refreshToken;

    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new UnauthorizedException('유효한 리프레시 토큰이 필요합니다.');
    }

    return this.authService.validateRefreshToken(payload, refreshToken);
  }
}
