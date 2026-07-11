import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * 업체 서비스 지역(coverageDistricts)은 시군구(5자리) 코드 기준으로 저장한다.
 * 읍면동(10자리) 코드가 들어오면 상위 시군구 코드로 정규화한다.
 * (서버 필터가 코드 완전일치(has) 매칭이므로 레벨을 통일해야 검색이 어긋나지 않음)
 */
export function normalizeToDistrictCode(code: string): string {
  return code.length > 5 ? code.slice(0, 5) : code;
}

/** 전국 시군구 마스터 → 코드:이름 맵 (영구 캐시). */
export function useDistrictMap(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ['regions', 'districts'],
    queryFn: () => api.regions.findDistricts(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return useMemo(
    () => new Map((data ?? []).map((d) => [d.code, d.name])),
    [data],
  );
}

/**
 * 법정동 코드 목록 → 표시 라벨 해석 함수.
 * - 시군구(5자리): "강동구"
 * - 레거시 읍면동(10자리): "강동구 고덕동" (해당 시군구의 읍면동 목록만 추가 조회)
 * - 마스터에 없는 코드는 원문 그대로 반환.
 */
export function useRegionLabelResolver(
  codes: string[],
): (code: string) => string {
  const districtMap = useDistrictMap();

  const wardParentCodes = useMemo(
    () =>
      Array.from(
        new Set(codes.filter((c) => c.length === 10).map((c) => c.slice(0, 5))),
      ),
    [codes],
  );

  const wardQueries = useQueries({
    queries: wardParentCodes.map((districtCode) => ({
      queryKey: ['regions', 'wards', districtCode],
      queryFn: () => api.regions.findWards(districtCode),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });

  const wardMap = new Map<string, string>();
  for (const q of wardQueries) {
    for (const w of q.data ?? []) wardMap.set(w.code, w.name);
  }

  return (code: string) => {
    if (code.length === 10) {
      const districtName = districtMap.get(code.slice(0, 5));
      const wardName = wardMap.get(code);
      if (districtName && wardName) return `${districtName} ${wardName}`;
      if (districtName) return districtName;
      return code;
    }
    return districtMap.get(code) ?? code;
  };
}
