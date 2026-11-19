import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConsultationDetailSheet } from './-consultation-detail-sheet';
import { ConsultationFormDialog } from './-consultation-form-dialog';

export const Route = createFileRoute('/_authenticated/consultations/$id')({
  component: ConsultationDetailPage,
});

/**
 * 상담 전체 화면. 상담분석의 옆 상세 패널에서 "새 탭으로 확장"을 누르면 열린다
 * (매물관리 · 거래관리 패널의 확장과 같다).
 * 목록의 "넓게 보기" 시트와 같은 내용을 같은 컴포넌트로 그린다: 브리프, 녹음이 있으면 받아쓰기와 업무 제안.
 */
function ConsultationDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  // 옆 패널이 목록에 없는 상담을 읽을 때 쓰는 것과 같은 캐시다.
  // 이 탭에서 고치거나 녹음 분석이 끝나면 ['consultations'] 무효화가 여기까지 닿지 않으므로 창에 돌아올 때 다시 받는다.
  const query = useQuery({
    queryKey: ['consultation', id],
    queryFn: () => api.consultations.findOne(id),
    refetchOnWindowFocus: true,
  });
  const consultation = query.data ?? null;
  const goToList = () => void navigate({ to: '/consultations' });

  return (
    <div data-consultation-page className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      {query.isLoading ? (
        <div className="mx-auto w-full max-w-[1120px] space-y-3 px-6 py-8">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : query.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">상담을 불러오지 못했습니다.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RotateCcw className="size-4" />
              재시도
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={goToList}>
              상담분석으로
            </Button>
          </div>
        </div>
      ) : consultation ? (
        // 시트와 같은 최대 폭. 넓은 창에서 받아쓰기 줄이 지나치게 길어지지 않는다.
        <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col overflow-hidden">
          <ConsultationDetailSheet
            key={consultation.id}
            layout="page"
            consultation={consultation}
            onEdit={() => setIsEditing(true)}
            onDeleted={goToList}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">상담을 찾을 수 없습니다.</p>
          <Button type="button" variant="outline" size="sm" onClick={goToList}>
            상담분석으로
          </Button>
        </div>
      )}

      <ConsultationFormDialog
        open={isEditing}
        onOpenChange={(open) => {
          setIsEditing(open);
          // 수정은 ['consultations']만 무효화한다. 이 화면이 읽는 한 건도 다시 받는다.
          if (!open) void query.refetch();
        }}
        consultation={consultation}
      />
    </div>
  );
}
