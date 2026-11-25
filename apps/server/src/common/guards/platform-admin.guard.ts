import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * 서비스 운영자(User.isPlatformAdmin) 전용 가드.
 * 토큰 클레임을 믿지 않고 요청마다 DB에서 활성·권한 여부를 확인한다.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUserPayload }>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException('운영자만 접근할 수 있습니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true, isActive: true },
    });

    if (!user?.isPlatformAdmin || !user.isActive) {
      throw new ForbiddenException('운영자만 접근할 수 있습니다.');
    }

    return true;
  }
}
