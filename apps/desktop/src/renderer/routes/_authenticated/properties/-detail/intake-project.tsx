import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getProjectProgress, getProjectStatus, getProjectTitle } from '../../projects/-project-model';
import { ProjectStatusChip } from '../../projects/-project-status-chip';
import { RailSection } from './rail';

/**
 * 매물 상세 오른쪽 열의 "프로젝트" 한 줄 — 이 매물 의뢰를 담은 프로젝트(한 의뢰는 한 프로젝트에만 담긴다).
 * 담긴 프로젝트가 없으면 아무것도 그리지 않는다(프로젝트는 사용자가 필요할 때만 연다).
 * 쿼리 이름표가 ["projects", "list", …]로 시작해 프로젝트를 고치거나 풀면 함께 새로 고쳐진다.
 */
export function IntakeProjectSection({ intakeId }: { intakeId: string | null | undefined }) {
  const filter = { listingIntakeId: intakeId ?? '', status: 'all' as const, limit: 1 };
  const projectsQuery = useQuery({
    queryKey: ['projects', 'list', filter],
    queryFn: () => api.projects.findAll(filter),
    enabled: Boolean(intakeId),
  });
  const project = projectsQuery.data?.items?.[0];
  if (!intakeId || !project) return null;
  const progress = getProjectProgress(project);
  return (
    <RailSection title="프로젝트">
      <div data-intake-project className="py-1">
        <Link
          to="/projects/$id"
          params={{ id: project.id }}
          className="flex min-w-0 items-center gap-2 rounded text-[13.5px] text-[#37352f] hover:underline"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{getProjectTitle(project)}</span>
          <ProjectStatusChip status={getProjectStatus(project)} />
        </Link>
        {progress.kind !== 'none' && (
          <p className="mt-0.5 truncate text-[12.5px] text-[#37352f]/55">
            {progress.kind === 'done'
              ? `${progress.total}/${progress.total} 모든 단계가 끝났습니다`
              : `${progress.done}/${progress.total} 다음 · ${progress.next ?? ''}`}
          </p>
        )}
      </div>
    </RailSection>
  );
}
