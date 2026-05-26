import {
  Body,
  Controller,
  Get,
  Param,
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

@ApiTags('직원')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.employeesService.findAll(user.officeId);
  }

  @Get(':id')
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.findOne(id, user.officeId);
  }

  @Post()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  create(
    @Body()
    dto: {
      name: string;
      password: string;
      phone?: string;
      email?: string;
      role?: string;
      loginId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.create(user, dto);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      phone?: string | null;
      email?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.update(id, user, dto);
  }

  @Patch(':id/status')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.updateStatus(id, user, dto.isActive);
  }

  @Patch(':id/role')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  updateRole(
    @Param('id') id: string,
    @Body() dto: { role: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.updateRole(id, user, dto.role);
  }

  /**
   * 사장님이 직원 비번 재설정 (옵션 1).
   * 분당 5회 제한 — 사장님 1명이 빠르게 여러 직원 처리하는 시나리오 고려.
   */
  @Post(':id/reset-password')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: { newPassword: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.resetPassword(id, user, dto.newPassword);
  }

  @Get(':id/performance')
  @Roles(...USER_ROLES)
  @UseGuards(RolesGuard)
  getPerformance(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.employeesService.getPerformance(id, user.officeId);
  }
}
