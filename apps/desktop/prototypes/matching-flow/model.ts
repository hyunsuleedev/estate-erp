export const stages = ['내부 후보', '고객 관심', '임장 가능 확인', '임장', '협상', '거래전환'];
export const stageTitles = ['이 매물을 고객에게 제안해 보세요', '고객의 관심을 확인해 주세요', '집주인과 방문 가능 여부를 확인하세요', '임장 결과를 함께 정리하세요', '합의할 조건을 확인하세요', '거래 준비로 이어집니다'];
export const nextActions = ['고객에게 제안', '관심 확인 완료', '임장 가능 확인 완료', '임장 후 협상 진행', '거래로 전환', '거래 준비 보기'];
export const checks = [
  ['매물 상태와 가격을 확인했어요'],
  ['고객이 이 매물에 관심을 보였어요'],
  ['집주인·점유자에게 방문 가능 여부를 확인했어요'],
  ['임장을 마쳤어요', '고객이 조건 협의를 원해요'],
  ['가격과 입주 조건을 합의했어요', '양측의 거래 진행 의사를 확인했어요'],
  [],
];
export type Customer = {
  id: string; name: string; initials: string; budget: string; condition: string;
  stage: number; age: string; urgent?: boolean; note: string; schedule: string;
  checked: string[]; closed: boolean; reason: string; history: string[];
};
export function seed(): Customer[] {
  return [
    { id: 'minjun', name: '김민준', initials: '민', budget: '29억–33억', condition: '실거주 · 남향 · 입주일 협의', stage: 2, age: '2일째', urgent: true, note: '평일에는 오후 6시 이후 방문 가능. 집주인에게 시간 확인 후 연락드리기.', schedule: '', checked: [], closed: false, reason: '', history: ['11. 11. 고객 관심 확인', '11. 10. 매물 제안'] },
    { id: 'seoyeon', name: '박서연', initials: '서', budget: '30억–32억', condition: '자녀 통학 · 12월 입주 희망', stage: 4, age: '오늘', note: '매수 희망가 31억 6,000만. 잔금일을 맞추면 가격 조정 여지가 있음.', schedule: '2026-11-12T15:00', checked: [], closed: false, reason: '', history: ['11. 13. 협상 시작', '11. 12. 임장 완료', '11. 10. 임장 가능 확인'] },
    { id: 'junho', name: '이준호', initials: '준', budget: '31억–34억', condition: '한강뷰 · 고층 · 주차 2대', stage: 3, age: '1일째', note: '배우자와 함께 방문 예정. 조망과 주차 동선을 자세히 확인하고 싶어 함.', schedule: '2026-11-14T14:00', checked: [], closed: false, reason: '', history: ['11. 12. 임장 일정 확정', '11. 11. 고객 관심 확인'] },
    { id: 'jieun', name: '오지은', initials: '지', budget: '30억–33억', condition: '면적 우선 · 입주 시기 유연', stage: 0, age: '오늘', note: '희망 면적과 예산이 맞는 신규 후보. 매물 사진을 먼저 보고 싶어 함.', schedule: '', checked: [], closed: false, reason: '', history: ['11. 13. 내부 후보 등록'] },
    { id: 'doyun', name: '최도윤', initials: '도', budget: '30억–34억', condition: '고층 · 펜트하우스 선호', stage: 2, age: '11. 12.', note: '가족과 상의 후 다른 단지로 결정.', schedule: '', checked: [], closed: true, reason: '다른 매물 선택', history: ['11. 12. 매칭 종료 · 다른 매물 선택', '11. 10. 고객 관심 확인'] },
  ];
}
export const candidates = [
  { id: 'haeun', name: '정하은', initials: '하', budget: '31억–33억', condition: '실거주 · 70평대 · 내년 1월 입주' },
  { id: 'woojin', name: '한우진', initials: '우', budget: '30억–35억', condition: '고층 · 조망 우선 · 일정 협의' },
];
export function scheduleLabel(value: string) {
  if (!value) return '방문 일정 미정';
  const [, month, day, hour, minute] = value.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)?.slice(1) ?? [];
  return month ? `${Number(month)}. ${Number(day)}. ${hour}:${minute}` : value;
}
export function actionHint(c: Customer) {
  if (c.closed) return c.reason;
  return ['매물 제안하기', '고객 회신 확인', '집주인 확인 대기', c.schedule ? `${scheduleLabel(c.schedule)} 방문` : '방문 일정 잡기', '가격·입주일 협의', '계약 조건 정리'][c.stage];
}
export type VariantProps = {
  customers: Customer[]; selectedId: string | null; inspectedStage: number | null;
  select: (id: string, stage?: number) => void;
  update: (id: string, patch: Partial<Customer>) => void;
  notify: (message: string) => void;
};
