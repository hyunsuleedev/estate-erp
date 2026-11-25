import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { USER_ROLES } from '../auth/auth.types';
import { EmployeesService } from './employees.service';

/** 주소의 직원 id가 uuid 모양이 아니면 DB까지 가지 않고 "없음"으로 답한다 (예전에는 500) */
const employeeIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('직원을 찾을 수 없습니다.'),
});

@ApiTags('직원')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    const employees = await this.employeesService.findAll(user.officeId);
    return employees.map((employee) => this.employeesService.forViewer(user, employee));
  }

  @Get(':id')
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  async findOne(
    @Param('id', employeeIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.forViewer(
      user,
      await this.employeesService.findOne(id, user.officeId),
    );
  }

  @Post()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  async create(
    @Body()
    dto: {
      name: string;
      password: string;
      phone?: string;
      email?: string;
      role?: string;
      loginId?: string;
      licenseType?: string | null;
      licenseNo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.forViewer(
      user,
      await this.employeesService.create(user, dto),
    );
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  async update(
    @Param('id', employeeIdPipe) id: string,
    @Body()
    dto: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      licenseType?: string | null;
      licenseNo?: string | null;
      payType?: string;
      baseSalary?: number | null;
      commissionRate?: number | null;
      employmentType?: string;
      withholdTax?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.forViewer(
      user,
      await this.employeesService.update(id, user, dto),
    );
  }

  @Patch(':id/status')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  async updateStatus(
    @Param('id', employeeIdPipe) id: string,
    @Body() dto: { isActive: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.forViewer(
      user,
      await this.employeesService.updateStatus(id, user, dto.isActive),
    );
  }

  @Patch(':id/role')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  async updateRole(
    @Param('id', employeeIdPipe) id: string,
    @Body() dto: { role: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.forViewer(
      user,
      await this.employeesService.updateRole(id, user, dto.role),
    );
  }

  /**
   * 사장님이 직원 비번 재설정 (옵션 1).
   * 분당 5회 제한 — 사장님 1명이 빠르게 여러 직원 처리하는 시나리오 고려.
   */
  @Post(':id/reset-password')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @Param('id', employeeIdPipe) id: string,
    @Body() dto: { newPassword: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.resetPassword(id, user, dto.newPassword);
  }

  @Get(':id/performance')
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  async getPerformance(
    @Param('id', employeeIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const perf = await this.employeesService.getPerformance(id, user.officeId);
    if (user.role === 'agent' && user.userId !== id) {
      return { ...perf, commissionAmountTotal: 0 };
    }
    return perf;
  }
}
