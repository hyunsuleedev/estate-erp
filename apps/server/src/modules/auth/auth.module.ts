import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { Auth0TokenVerifier } from './auth0-token-verifier';
import { Auth0ManagementService } from './auth0-management.service';
import { Auth0AccountSyncService } from './auth0-account-sync.service';
import { StaffAuthService } from './staff-auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    Auth0TokenVerifier,
    Auth0ManagementService,
    Auth0AccountSyncService,
    StaffAuthService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    Auth0TokenVerifier,
    Auth0ManagementService,
    Auth0AccountSyncService,
    StaffAuthService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
