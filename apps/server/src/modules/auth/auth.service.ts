import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: {
    loginId: string;
    email: string;
    password: string;
    name: string;
    officeName: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { loginId: dto.loginId },
    });
    if (existing) throw new ConflictException('이미 사용 중인 아이디입니다.');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const office = await this.prisma.office.create({
      data: { name: dto.officeName },
    });

    const user = await this.prisma.user.create({
      data: {
        loginId: dto.loginId,
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        officeId: office.id,
        role: 'owner',
      },
    });

    return {
      ...this.generateTokens(user.id, user.officeId),
      user: {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      office: { id: office.id, name: office.name },
    };
  }

  async login(loginId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { loginId },
      include: { office: true },
    });
    if (!user) throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');

    return {
      ...this.generateTokens(user.id, user.officeId),
      user: {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      office: { id: user.office.id, name: user.office.name },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { office: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role,
      office: { id: user.office.id, name: user.office.name },
    };
  }

  private generateTokens(userId: string, officeId: string) {
    const payload = { sub: userId, officeId };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }
}
