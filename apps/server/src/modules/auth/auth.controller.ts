import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { USER_ROLES } from './auth.types';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 사장님 회원가입 — 신규 사무소 + 첫 owner 계정 생성. 분당 5회 제한.
   */
  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  register(
    @Body()
    dto: {
      loginId?: string;
      email: string;
      password: string;
      name: string;
      officeName: string;
    },
  ) {
    return this.authService.register(dto);
  }

  /**
   * 로그인 — Supabase signInWithPassword를 통해 비번 검증 + Supabase JWT 발급.
   * 응답의 accessToken/refreshToken은 Supabase JWT 그대로.
   *
   * Brute Force 방어: IP당 분당 10회 (auth 그룹). Supabase 자체 rate limit 위에 추가 레이어.
   */
  @Post('login')
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: { loginId: string; password: string }) {
    return this.authService.login(dto.loginId, dto.password);
  }

  /**
   * Refresh — Supabase refreshSession으로 새 Supabase JWT 발급.
   * 분당 30회 (정상적인 토큰 만료 갱신 + 약간의 버퍼).
   */
  @Post('refresh')
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Logout — Supabase 세션 무효화 (모든 디바이스).
   */
  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...USER_ROLES)
  logout(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.logout(user.supabaseUserId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...USER_ROLES)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user.userId);
  }
}
