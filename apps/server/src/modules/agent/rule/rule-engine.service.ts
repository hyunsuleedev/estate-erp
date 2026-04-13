import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProposalService } from '../proposal/proposal.service';
import { RULE_REGISTRY, Rule, RuleContext, TrustTier } from './rule.types';

/**
 * RuleEngineService
 *
 * 모든 Rule 구현체를 DI 로 주입받아서:
 *   - triggerType === 'schedule' → SchedulerRegistry 에 CronJob 등록
 *   - triggerType === 'event'    → (Phase 2) EventEmitter2 구독
 *
 * Phase 1 실행 파이프라인: @nestjs/schedule in-process cron.
 *   - 단일 인스턴스 보장을 위해 `RULE_ENGINE_ENABLED=true` 인 프로세스에서만 동작.
 *   - 모든 Rule 은 SQL 기반 밀리초 단위이고, dedupeKey 로 재실행 안전망.
 *   - LLM Rule / 다중 인스턴스 / 50+ 사무소로 커지면 BullMQ 로 전환.
 *
 * onModuleInit 시퀀스:
 *   1. 모든 활성 사무소에 대해 isSystem Rule 을 DB 에 upsert (seed).
 *   2. schedule 타입 Rule 을 전역 1회 cron 으로 등록 (사무소별이 아니라 Rule 단위).
 *   3. cron 실행 시점에는 `isActive=true` 인 모든 사무소를 순회하며 `runRule` 호출.
 */
@Injectable()
export class RuleEngineService implements OnModuleInit {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalService: ProposalService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    @Inject(RULE_REGISTRY) private readonly rules: Rule[],
  ) {}

  async onModuleInit() {
    const enabled = this.config.get<string>('RULE_ENGINE_ENABLED') === 'true';
    this.logger.log(
      `Rule Engine registered ${this.rules.length} rules (enabled=${enabled})`,
    );
    for (const rule of this.rules) {
      this.logger.log(
        `  - ${rule.name}@${rule.version} (${rule.triggerType}${
          rule.schedule ? ` ${rule.schedule}` : ''
        }, system=${rule.isSystem})`,
      );
    }

    await this.seedSystemRules();

    if (!enabled) {
      this.logger.warn(
        'RULE_ENGINE_ENABLED != true — skipping cron registration. Set RULE_ENGINE_ENABLED=true on exactly one instance.',
      );
      return;
    }

    this.registerSchedules();
  }

  /**
   * 모든 활성 사무소에 대해 isSystem=true Rule 을 DB 에 upsert.
   * 신규 사무소가 생기면 그 사무소가 첫 로그인 / 첫 Rule 조회 시에도 lazy seed 가 필요하지만,
   * Phase 1 에서는 앱 부팅 시 한 번만 수행하는 것으로 충분 (사무소 수 적음).
   */
  private async seedSystemRules() {
    const offices = await this.prisma.office.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const systemRules = this.rules.filter((r) => r.isSystem);
    if (offices.length === 0 || systemRules.length === 0) return;

    let created = 0;
    for (const office of offices) {
      for (const rule of systemRules) {
        const result = await this.prisma.rule.upsert({
          where: {
            officeId_name: { officeId: office.id, name: rule.name },
          },
          update: {
            displayName: rule.displayName,
            description: rule.description,
            triggerType: rule.triggerType,
            schedule: rule.schedule,
            eventName: rule.eventName,
            isSystem: true,
          },
          create: {
            officeId: office.id,
            name: rule.name,
            displayName: rule.displayName,
            description: rule.description,
            triggerType: rule.triggerType,
            schedule: rule.schedule,
            eventName: rule.eventName,
            config: (rule.defaultConfig ?? {}) as object,
            isActive: rule.defaultActive,
            isSystem: true,
          },
        });
        if (result) created++;
      }
    }
    this.logger.log(
      `Seeded ${created} system rule rows across ${offices.length} offices`,
    );
  }

  /**
   * schedule 타입 Rule 을 전역 1회 cron 으로 등록.
   * 실행 시점에 모든 활성 사무소를 돌면서 runRule() 호출.
   */
  private registerSchedules() {
    const scheduleRules = this.rules.filter(
      (r) => r.triggerType === 'schedule' && r.schedule,
    );

    for (const rule of scheduleRules) {
      const jobName = `rule:${rule.name}`;
      if (this.scheduler.doesExist('cron', jobName)) {
        this.logger.warn(`Cron ${jobName} already registered, skipping`);
        continue;
      }
      const job = new CronJob(rule.schedule!, async () => {
        await this.fanOutRule(rule);
      });
      this.scheduler.addCronJob(jobName, job as unknown as CronJob);
      job.start();
      this.logger.log(`Registered cron ${jobName} (${rule.schedule})`);
    }
  }

  /**
   * 하나의 Rule 을 모든 활성 사무소에 대해 실행.
   */
  private async fanOutRule(rule: Rule) {
    const offices = await this.prisma.office.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    this.logger.log(
      `Running rule ${rule.name} for ${offices.length} offices`,
    );
    for (const office of offices) {
      try {
        await this.runRule(rule, { officeId: office.id });
      } catch (error) {
        this.logger.error(
          `Rule ${rule.name} fan-out failed for office ${office.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * 특정 Rule 을 특정 사무소에 대해 한 번 실행.
   * cron fan-out, event 핸들러, 테스트 수동 호출의 공통 진입점.
   */
  async runRule(
    rule: Rule,
    baseCtx: { officeId: string; event?: RuleContext['event'] },
  ): Promise<void> {
    const ruleRecord = await this.prisma.rule.findUnique({
      where: {
        officeId_name: { officeId: baseCtx.officeId, name: rule.name },
      },
    });
    if (ruleRecord && !ruleRecord.isActive) {
      this.logger.debug(
        `Rule ${rule.name} inactive for office ${baseCtx.officeId}, skipping`,
      );
      return;
    }

    const ctx: RuleContext = {
      officeId: baseCtx.officeId,
      now: new Date(),
      event: baseCtx.event,
      ruleConfig:
        (ruleRecord?.config as Record<string, unknown>) ?? rule.defaultConfig,
      trustTierFor: (_type: string, fallback: TrustTier) => fallback,
    };

    try {
      const drafts = await rule.evaluate(ctx);
      if (drafts.length === 0) return;
      await this.proposalService.createMany(
        baseCtx.officeId,
        drafts,
        `rule:${rule.name}:${rule.version}`,
      );
      this.logger.log(
        `Rule ${rule.name} produced ${drafts.length} proposals for office ${baseCtx.officeId}`,
      );
    } catch (error) {
      this.logger.error(
        `Rule ${rule.name} failed for office ${baseCtx.officeId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
