import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { office: true },
    });

    if (!user || !user.isActive || user.office?.isActive === false) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role,
      isPlatformAdmin: !!user.isPlatformAdmin,
      office: user.office
        ? {
            id: user.office.id,
            name: user.office.name,
          }
        : null,
      onboardingRequired: !user.office,
    };
  }
}
