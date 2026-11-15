import { Global, Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { Auth0TokenVerifier } from './auth0-token-verifier';
import { Auth0ManagementService } from './auth0-management.service';
import { Auth0AccountSyncService } from './auth0-account-sync.service';
import { StaffAuthService } from './staff-auth.service';
import { Auth0PasswordChangeService } from './auth0-password-change.service';
import { Auth0EventsController } from './auth0-events.controller';
import { RealtimeModule } from '../../realtime/realtime.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Global()
@Module({
  // RealtimeModule도 이 모듈을 가져오므로 서로 늦게 참조한다.
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [AuthController, Auth0EventsController],
  providers: [
    AuthService,
    Auth0TokenVerifier,
    Auth0ManagementService,
    Auth0AccountSyncService,
    StaffAuthService,
    Auth0PasswordChangeService,
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
