import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Property, Unit } from '@estate-erp/api-client';
import { formatPlaceLabel } from '@estate-erp/shared';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { PropertyDetailScreen, type RequestableDialog } from './PropertyDetailScreen';
import { nb } from './ui';

/** 서버의 호실 조회는 단지·동을 함께 준다 (api-client의 Unit 타입에는 빠져 있다) */
type UnitWithPlace = Unit & {
  site?: Property['site'];
  dong?: { id: string; name: string; isPlaceholder?: boolean } | null;
  properties?: Array<{ id: string }>;
};

/**
 * 호실로 여는 매물 상세 (/properties/unit/$unitId).
 * 관리호수(Property)가 있으면 그 상세를, 없으면 호실 정보만 채운 빈 상세를 보여 준다.
 * 빈 상세에서 거래 조건·연락처·상담 등을 적기 시작하면 그때 관리호수를 만든다.
 */
export function UnitPropertyDetailScreen({ unitId }: { unitId: string }) {
  const queryClient = useQueryClient();
  const replaceTabResource = useTabStore((state) => state.replaceTabResource);
  // 만드는 도중에 다른 탭으로 가도 이 탭만 바꾼다
  const ownerTabIdRef = useRef(useTabStore.getState().activeTabId);
  const unitQuery = useQuery({
    queryKey: ['units', 'property-detail', unitId],
    queryFn: () => api.units.findOne(unitId) as Promise<UnitWithPlace>,
    // 관리호수가 그새 생겼는지는 열 때마다 새로 본다
    staleTime: 0,
  });
  const unit = unitQuery.data;
  const existingPropertyId = unit?.properties?.[0]?.id ?? null;

  const title = unit
    ? [
        unit.site?.name,
        formatPlaceLabel({ dongName: unit.dong?.name, dongIsPlaceholder: unit.dong?.isPlaceholder, unit }),
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const closeTab = useTabStore((state) => state.closeTab);
  /**
   * 이 탭을 그 관리호수의 매물 상세로 바꾼다. 열 입력 창은 주소(?dialog=)에 실어 보낸다 —
   * 화면이 새로 그려지거나 늦게 그려져도, 이미 열려 있던 탭으로 넘어가도 요청이 남는다.
   */
  const handedOff = useRef(false);
  const open = useCallback(
    (propertyId: string, options?: { dialog?: RequestableDialog; mayBeOpenElsewhere?: boolean }) => {
      const ownerId = ownerTabIdRef.current;
      // 이 탭은 한 번만 넘긴다. 두 번 넘기면(호실 다시 받기와 만들기 응답이 엇갈릴 때) 나중 것이
      // 입력 창 요청을 지우거나, 방금 매물 상세로 바뀐 이 탭을 닫아 버린다.
      if (!ownerId || handedOff.current) return;
      handedOff.current = true;
      const path = `/properties/${propertyId}`;
      const route = options?.dialog ? `${path}?dialog=${options.dialog}` : path;
      const meta = getRouteMeta(path);
      const target = {
        route,
        kind: meta.kind,
        title: title || meta.title,
        resourceKey: tabResourceKeys.entity('property', propertyId),
      };
      if (options?.dialog && options.mayBeOpenElsewhere) {
        // 전부터 있던 관리호수면 그 매물의 탭이 이미 열려 있을 수 있다. 그 탭으로 요청을 넘기고
        // (없으면 새로 열고) 이 탭은 닫는다. 닫힌 탭의 요청은 무시되므로 여는 것이 먼저다.
        openOrRevealResource(target);
        closeTab(ownerId);
        return;
      }
      // 같은 매물의 탭이 이미 있으면 이 탭을 닫고 그 탭으로 간다
      replaceTabResource(ownerId, target);
    },
    [closeTab, openOrRevealResource, replaceTabResource, title],
  );
  // 이미 관리호수인 호실(다른 곳에서 그새 등록한 경우 포함)은 빈 상세를 보이지 않고 바로 옮긴다
  // 입력 창을 누른 뒤에는 그 요청이 탭을 넘긴다(여기서 먼저 넘기면 누른 창이 열리지 않는다).
  // 만들지 못해 요청이 끝나면 다시 여기서 본다.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const isFresh = !unitQuery.isFetching && !unitQuery.isPlaceholderData;
  useEffect(() => {
    if (existingPropertyId && isFresh && !starting) open(existingPropertyId);
  }, [existingPropertyId, isFresh, open, starting]);

  // 한꺼번에 두 번 눌러도 관리호수는 한 번만 만들고, 처음 누른 창을 연다
  const start = useCallback(
    (dialog: RequestableDialog) => {
      if (!unit || startingRef.current || handedOff.current) return;
      startingRef.current = true;
      setStarting(true);
      api.properties
        .ensure({ siteId: unit.siteId, unitId: unit.id })
        .then((ensured) => {
          // 관리단지의 호수 표·단지별 관리호수 수·매물 목록·이 호실을 연 다른 탭에 바로 나오게 한다
          void queryClient.invalidateQueries({ queryKey: ['sites', unit.siteId] });
          void queryClient.invalidateQueries({ queryKey: ['office-sites'] });
          void queryClient.invalidateQueries({ queryKey: ['properties'] });
          void queryClient.invalidateQueries({ queryKey: ['units'] });
          open(ensured.id, { dialog, mayBeOpenElsewhere: !ensured.created });
        })
        .catch((error: unknown) => {
          startingRef.current = false;
          setStarting(false);
          toast.error(apiErrorMessage(error, '관리호수로 등록하지 못했습니다. 다시 시도해 주세요.'));
        });
    },
    [open, queryClient, unit],
  );

  const draft = useMemo(() => {
    if (!unit) return undefined;
    const property: Property = {
      id: '',
      officeId: '',
      siteId: unit.siteId,
      unitId: unit.id,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
      site: unit.site,
      unit: { ...unit, dong: unit.dong ?? null },
      propertyContacts: [],
      tenants: [],
      consultations: [],
      listings: [],
      pastListings: [],
    };
    return { property, start };
  }, [start, unit]);

  if (!unit || !draft || existingPropertyId) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
        {unitQuery.isError && (
          <>
            <p className="text-[13px] text-[#787774]">호실 정보를 불러오지 못했습니다.</p>
            <button type="button" className={nb.line} onClick={() => void unitQuery.refetch()}>
              <RefreshCw />
              다시 시도
            </button>
          </>
        )}
      </div>
    );
  }

  return <PropertyDetailScreen propertyId={null} draft={draft} />;
}
