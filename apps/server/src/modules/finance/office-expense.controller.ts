import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from './finance-params';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { OfficeExpenseService } from './office-expense.service';

@ApiTags('Finance / Office Expense')
@ApiBearerAuth()
@Controller('finance/expenses')
@UseGuards(JwtAuthGuard)
export class OfficeExpenseController {
  constructor(private readonly service: OfficeExpenseService) {}

  // 임대료·인건비 같은 사무소 비용이라 대표·매니저만 본다 (화면도 대표·매니저 전용)
  @Get()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.officeId);
  }

  @Post()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      title: string;
      category: string;
      amount: number;
      frequency?: string;
      dayOfMonth?: number | null;
      taxDeductible?: boolean;
      note?: string | null;
    },
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  update(
    @Param('id', uuidParam('고정비')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      title?: string;
      category?: string;
      amount?: number;
      frequency?: string;
      dayOfMonth?: number | null;
      taxDeductible?: boolean;
      isActive?: boolean;
      note?: string | null;
    },
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  remove(
    @Param('id', uuidParam('고정비')) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
