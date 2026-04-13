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

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.officeId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      title: string;
      category: string;
      amount: number;
      frequency?: string;
      dayOfMonth?: number;
      taxDeductible?: boolean;
      note?: string;
    },
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      title?: string;
      category?: string;
      amount?: number;
      frequency?: string;
      dayOfMonth?: number;
      taxDeductible?: boolean;
      isActive?: boolean;
      note?: string;
    },
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
