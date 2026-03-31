import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body()
    dto: {
      loginId: string;
      email: string;
      password: string;
      name: string;
      officeName: string;
    },
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: { loginId: string; password: string }) {
    return this.authService.login(dto.loginId, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user.userId);
  }
}
