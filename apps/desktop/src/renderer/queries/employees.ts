import { queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  EmployeeDetail,
  EmployeeSection,
  EmployeeSections,
} from '@estate-erp/api-client';

import { api } from '@/lib/api';

/**
 * 직원 조회는 여기서만 정의한다.
 *
 * 직원 상세는 한 덩어리로 받지 않는다. 기본 정보·건수(1KB)와 딸린 목록 일곱 가지를 따로 받는다.
 * 한 응답에 다 붙였을 때는 직원 한 명이 100KB를 넘었고, 업무 하나만 바뀌어도 전부 다시 받았다.
 * 나눠 두면 바뀐 목록만 다시 받는다(invalidateEmployeeSections).
 *
 * 키: ['employees'] 목록 · ['employee', id] 기본 정보 · ['employee-section', 목록, id] 딸린 목록.
 * 목록 이름이 id보다 앞이라, 거래가 바뀌면 모든 직원의 'deals'만 한 번에 다시 받게 할 수 있다.
 */
export const EMPLOYEE_SECTIONS = [
  'tasks',
  'buyerRequirements',
  'projects',
  'deals',
  'settlements',
  'consultations',
  'activities',
] as const satisfies readonly EmployeeSection[];

export const employeeQueries = {
  list: ['employees'] as const,

  /** 기본 정보와 건수 */
  profile: (id: string) =>
    queryOptions({
      queryKey: ['employee', id] as const,
      queryFn: () => api.employees.findProfile(id),
    }),

  /** 딸린 목록 하나 */
  section: <S extends EmployeeSection>(id: string, section: S) =>
    queryOptions({
      queryKey: ['employee-section', section, id] as const,
      queryFn: (): Promise<EmployeeSections[S]> => api.employees.findSection(id, section),
    }),

  performance: (id: string) =>
    queryOptions({
      queryKey: ['employee-performance', id] as const,
      queryFn: () => api.employees.getPerformance(id),
    }),
};

interface Invalidator {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
}

/**
 * 직원에 딸린 목록이 바뀌었을 때 다시 받을 것: 그 목록과, 건수가 실린 기본 정보·직원 목록·실적.
 * employeeId를 주면 그 직원 것만, 안 주면 모든 직원의 그 목록을 다시 받는다(누구 것이 바뀌었는지 모를 때).
 * 실제로 다시 요청되는 것은 지금 화면에 떠 있는 것뿐이다.
 */
export function invalidateEmployeeSections(
  queryClient: Invalidator,
  sections: readonly EmployeeSection[],
  employeeId?: string,
): void {
  for (const section of sections) {
    void queryClient.invalidateQueries({
      queryKey: employeeId ? ['employee-section', section, employeeId] : ['employee-section', section],
    });
  }
  void queryClient.invalidateQueries({ queryKey: employeeId ? ['employee', employeeId] : ['employee'] });
  void queryClient.invalidateQueries({
    queryKey: employeeId ? ['employee-performance', employeeId] : ['employee-performance'],
  });
  void queryClient.invalidateQueries({ queryKey: employeeQueries.list });
}

/**
 * 직원 상세 화면이 쓰는 한 덩어리. 기본 정보와 목록을 따로 받아(따로 저장·따로 갱신) 화면에는 합쳐서 준다.
 * 처음에는 전부 도착한 뒤에 그린다 — 일부만 온 상태로 그리면 아직 안 온 목록이 "없음"으로 보인다.
 */
export function useEmployeeDetail(id: string) {
  const profileQuery = useQuery(employeeQueries.profile(id));
  const sectionQueries = useQueries({
    queries: EMPLOYEE_SECTIONS.map((section) => employeeQueries.section(id, section)),
  });

  const profile = profileQuery.data;
  // EMPLOYEE_SECTIONS와 같은 순서
  const tasks = sectionQueries[0].data as EmployeeSections['tasks'] | undefined;
  const buyerRequirements = sectionQueries[1].data as EmployeeSections['buyerRequirements'] | undefined;
  const projects = sectionQueries[2].data as EmployeeSections['projects'] | undefined;
  const deals = sectionQueries[3].data as EmployeeSections['deals'] | undefined;
  const settlements = sectionQueries[4].data as EmployeeSections['settlements'] | undefined;
  const consultations = sectionQueries[5].data as EmployeeSections['consultations'] | undefined;
  const activities = sectionQueries[6].data as EmployeeSections['activities'] | undefined;

  const detail = useMemo<EmployeeDetail | undefined>(() => {
    if (
      !profile ||
      !tasks ||
      !buyerRequirements ||
      !projects ||
      !deals ||
      !settlements ||
      !consultations ||
      !activities
    ) {
      return undefined;
    }
    return {
      ...profile,
      assignedTasks: tasks,
      assignedBuyerRequirements: buyerRequirements,
      assignedProjects: projects,
      dealParticipants: deals,
      recentSettlementLines: settlements,
      recentConsultations: consultations,
      recentActivities: activities,
    };
  }, [profile, tasks, buyerRequirements, projects, deals, settlements, consultations, activities]);

  const queries = [profileQuery, ...sectionQueries];
  return {
    /** 기본 정보만 — 목록이 다시 와도 바뀌지 않는다(입력 중인 계정 양식이 초기화되지 않게 이것을 넘긴다) */
    profile,
    detail,
    isLoading: !detail && queries.some((query) => query.isLoading),
    isError: !detail && queries.some((query) => query.isError),
    refetch: () => {
      for (const query of queries) {
        if (query.isError || !query.data) void query.refetch();
      }
    },
  };
}
