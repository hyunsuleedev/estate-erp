export const PROPERTY_TABLE_PILL_CLASS_NAME =
  "inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5";
/** 매물관리 표의 거래·분류 태그 — 높이 20px, 모서리 4px. 37px 줄 안에 들어간다. */
export const PROPERTY_TABLE_TAG_CLASS_NAME =
  "inline-flex h-5 max-w-full items-center whitespace-nowrap rounded-[4px] px-1.5 text-[13px] font-normal leading-none";
/** 매물관리 표의 상태 알약 — 높이 20px, 둥근 끝, 앞에 작은 점(PROPERTY_TABLE_STATUS_DOT_CLASS_NAME). */
export const PROPERTY_TABLE_STATUS_PILL_CLASS_NAME =
  "inline-flex h-5 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-normal leading-none";
export const PROPERTY_TABLE_STATUS_DOT_CLASS_NAME =
  "size-1.5 shrink-0 rounded-full bg-current opacity-70";
export const PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME =
  "inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5";
export const PROPERTY_TABLE_PILL_TONES = {
  neutral: "bg-[#f1f1ef] text-[#787774]",
  neutralStrong: "bg-[#f1f1ef] text-[#5f5e5b]",
  success: "bg-[#eef3ed] text-[#44745a]",
  info: "bg-[#e7f3f8] text-[#337ea9]",
  warning: "bg-[#fbf3db] text-[#8f6b1f]",
  danger: "bg-[#fdebec] text-[#8f4b46]",
  violet: "bg-violet-soft text-violet",
} as const;
export const PROPERTY_TABLE_TRANSACTION_META: Record<
  string,
  { label: string; className: string }
> = {
  sale: { label: "매매", className: PROPERTY_TABLE_PILL_TONES.danger },
  jeonse: { label: "전세", className: PROPERTY_TABLE_PILL_TONES.info },
  monthly: { label: "월세", className: PROPERTY_TABLE_PILL_TONES.warning },
};

export function rankTone(ranking: number | null | undefined): string {
  if (ranking == null) return PROPERTY_TABLE_PILL_TONES.neutral;
  if (ranking <= 3) return PROPERTY_TABLE_PILL_TONES.success;
  if (ranking <= 10) return PROPERTY_TABLE_PILL_TONES.info;
  return PROPERTY_TABLE_PILL_TONES.warning;
}
