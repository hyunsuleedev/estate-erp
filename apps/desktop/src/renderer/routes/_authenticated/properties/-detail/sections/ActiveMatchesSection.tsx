import { Link } from '@tanstack/react-router';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import { ChevronRight, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatBuyerBudget,
  formatRelativeDate,
  matchStageLabels,
} from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

interface Props {
  matches: Match[];
}

const stageColors: Record<string, string> = {
  suggested: 'bg-slate-50 text-slate-600',
  buyerInterested: 'bg-blue-50 text-blue-700',
  viewingConfirmed: 'bg-orange-50 text-orange-700',
  viewing: 'bg-indigo-50 text-indigo-700',
  negotiating: 'bg-amber-50 text-amber-700',
  dealCreated: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};

export function ActiveMatchesSection({ matches }: Props) {
  // active = not closed
  const active = matches.filter(
    (match) => normalizeMatchStage(match.stage) !== MatchStage.CLOSED,
  );

  return (
    <MainSection title="진행 중 매칭" count={active.length}>
      {active.length === 0 ? (
        <MainSectionEmpty text="진행 중인 매칭이 없습니다." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-white">
          {active.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
        </ul>
      )}
    </MainSection>
  );
}

function MatchRow({ match }: { match: Match }) {
  const buyer = match.buyerRequirement;
  const normalizedStage = normalizeMatchStage(match.stage);
  const stage = matchStageLabels[normalizedStage] ?? normalizedStage;
  const budget = formatBuyerBudget(match);

  return (
    <li>
      <Link
        to="/matches"
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
      >
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">
          <User className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground">
              {buyer?.contact?.name ?? '매수자'}
            </span>
            <Badge
              className={cn(
                'border-0 text-[10px]',
                stageColors[normalizedStage] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {stage}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span>{budget}</span>
            <span>·</span>
            <span>{formatRelativeDate(match.updatedAt)}</span>
          </div>
        </div>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
