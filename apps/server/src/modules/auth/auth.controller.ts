import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { RefreshTokenGuard } from '../../common/guards/refresh-token.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser, USER_ROLES } from './auth.types';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
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

  @Post('login')
  @UseGuards(LocalAuthGuard)
  login(
    @Req() request: AuthenticatedRequest,
    @Body() _dto: { loginId: string; password: string },
  ) {
    return this.authService.login(request.user);
  }

  @Post('refresh')
  @UseGuards(RefreshTokenGuard, RolesGuard)
  @Roles(...USER_ROLES)
  refresh(
    @Req() request: AuthenticatedRequest,
    @Body() _dto: { refreshToken: string },
  ) {
    return this.authService.refresh(request.user);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...USER_ROLES)
  logout(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.logout(user.userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...USER_ROLES)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user.userId);
  }
}
