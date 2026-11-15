/**
 * 네이버 부동산 공식 매물 제휴사 목록 (19곳).
 * https://help.pay.naver.com/faq/content.help?faqId=17071
 * value는 ERP 내부 식별자이며, 기존 esiljang / budongsanbank 값을 유지한다.
 */
export const naverCpChannels = [
  { value: 'gongsilclub', label: '공실클럽' },
  { value: 'kcr', label: '교차로부동산' },
  { value: 'dabang', label: '다방' },
  { value: 'maekyung', label: '매경부동산' },
  { value: 'lets', label: '부동산렛츠' },
  { value: 'budongsanbank', label: '부동산뱅크' },
  { value: 'serve', label: '부동산써브' },
  { value: 'rfine', label: '부동산포스' },
  { value: 'industry', label: '산업부동산' },
  { value: 'sunbang', label: '선방' },
  { value: 'asil', label: '아실' },
  { value: 'rter', label: '알터' },
  { value: 'woorijip', label: '우리집부동산' },
  { value: 'ulsankcr', label: '울산교차로' },
  { value: 'esiljang', label: '이실장플러스' },
  { value: 'cheonankcr', label: '천안교차로' },
  { value: 'tencomms', label: '텐컴즈' },
  // 공식명: 피터팬의 좋은방구하기. 화면에서는 사용자 요청에 따라 줄여 쓴다.
  { value: 'peterpan', label: '피터팬' },
  { value: 'hankyung', label: '한경부동산' },
];

export function getAdChannelLabel(channel: string) {
  return naverCpChannels.find(option => option.value === channel)?.label ?? channel;
}

export function isNaverCpChannel(value: unknown): value is string {
  return typeof value === 'string' && naverCpChannels.some(option => option.value === value);
}
