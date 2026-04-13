import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RULE_REGISTRY, Rule } from './rule.types';

/**
 * RuleController
 *
 * GET   /agent/rules            — 현재 사무소의 Rule 목록 (DB 레코드 + registry 메타 조인)
 * PATCH /agent/rules/:name      — isActive 토글
 *
 * 설계: Rule 레코드는 RuleEngineService.onModuleInit 의 seedSystemRules 가 미리 upsert 해둔다.
 * 사용자는 Rule 을 생성/삭제하지 않고 활성/비활성만 조절한다 (Phase 1).
 */
@ApiTags('AI 직원 / Rule')
@ApiBearerAuth()
@Controller('agent/rules')
@UseGuards(JwtAuthGuard)
export class RuleController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RULE_REGISTRY) private readonly registry: Rule[],
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const rows = await this.prisma.rule.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'asc' },
    });

    const byName = new Map(rows.map((r) => [r.name, r]));

    return this.registry.map((rule) => {
      const row = byName.get(rule.name);
      return {
        name: rule.name,
        version: rule.version,
        displayName: rule.displayName,
        description: rule.description ?? null,
        triggerType: rule.triggerType,
        schedule: rule.schedule ?? null,
        eventName: rule.eventName ?? null,
        isSystem: rule.isSystem,
        isActive: row?.isActive ?? rule.defaultActive,
        config: row?.config ?? rule.defaultConfig ?? {},
        seeded: Boolean(row),
      };
    });
  }

  @Patch(':name')
  async update(
    @Param('name') name: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { isActive?: boolean },
  ) {
    const updated = await this.prisma.rule.update({
      where: {
        officeId_name: { officeId: user.officeId, name },
      },
      data: {
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      },
    });
    return updated;
  }
}
