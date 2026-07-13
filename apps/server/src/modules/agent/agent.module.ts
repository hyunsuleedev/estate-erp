import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { ProposalService } from './proposal/proposal.service';
import { ProposalController } from './proposal/proposal.controller';
import { ExecutorService } from './executor/executor.service';
import { AssignmentService } from './executor/assignment.service';
import { RuleEngineService } from './rule/rule-engine.service';
import { RuleController } from './rule/rule.controller';
import { AdTakedownRule } from './rule/implementations/ad-takedown.rule';
import { LeaseExpiryRule } from './rule/implementations/lease-expiry.rule';
import { NewExternalListingsRule } from './rule/implementations/new-external-listings.rule';
import { TransactionReportDeadlineRule } from './rule/implementations/transaction-report-deadline.rule';
import { RULE_REGISTRY } from './rule/rule.types';
import { AgentControlPlaneService } from './control-plane/control-plane.service';

/**
 * AgentModule
 *
 * "AI 직원" 기능의 진입점:
 *   - Proposal: 단일 승인 큐 (Rule/MCP/Event 가 쓰고, inbox UI 가 읽음)
 *   - Rule: 규칙 엔진 (법 기반 / 임계값 기반 / 스케줄 / 이벤트)
 *   - Executor: 승인된 제안의 actionPayload 를 도메인 서비스 호출로 번역
 *   - AssignmentService: Task 할당 담당자 결정 (Phase 1 휴리스틱, Phase 2 LLM)
 *
 * 설계 문서: docs/ai-employee-architecture.md
 *
 * 의존성:
 *   PrismaModule → ProposalService, ExecutorService, AssignmentService, Rule 들
 *   TasksModule  → ExecutorService (create_task 액션에서 TasksService 재사용)
 *
 * Rule 구현체는 RULE_REGISTRY 토큰으로 배열 주입된다.
 * 새 Rule 추가 = implementations/ 에 파일 하나 + providers 배열과 RULE_REGISTRY 배열에 추가.
 */
@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, TasksModule],
  controllers: [ProposalController, RuleController],
  providers: [
    ProposalService,
    ExecutorService,
    AssignmentService,
    AgentControlPlaneService,
    RuleEngineService,
    AdTakedownRule,
    LeaseExpiryRule,
    NewExternalListingsRule,
    TransactionReportDeadlineRule,
    {
      provide: RULE_REGISTRY,
      useFactory: (
        ad: AdTakedownRule,
        lease: LeaseExpiryRule,
        newExt: NewExternalListingsRule,
        report: TransactionReportDeadlineRule,
      ) => [ad, lease, newExt, report],
      inject: [
        AdTakedownRule,
        LeaseExpiryRule,
        NewExternalListingsRule,
        TransactionReportDeadlineRule,
      ],
    },
  ],
  exports: [
    ProposalService,
    RuleEngineService,
    ExecutorService,
    AgentControlPlaneService,
  ],
})
export class AgentModule {}
