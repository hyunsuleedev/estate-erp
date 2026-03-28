import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    email: string;
    password: string;
    name: string;
    officeName: string;
  }) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const office = await this.prisma.office.create({
      data: { name: dto.officeName },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        officeId: office.id,
        role: 'admin',
      },
    });

    return {
      ...this.generateTokens(user.id, user.officeId),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      office: { id: office.id, name: office.name },
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { office: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return {
      ...this.generateTokens(user.id, user.officeId),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
