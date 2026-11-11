import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ClerkAuthService } from './clerk-auth.service';
import { Auth0AuthService } from './auth0-auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    ClerkAuthService,
    Auth0AuthService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, ClerkAuthService, JwtAuthGuard],
})
export class AuthModule {}
