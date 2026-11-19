import { createContext, useContext, type MutableRefObject } from "react";
import type {
  AdvertisementChangeRequest,
  ListingAdvertisementWithListing,
} from "@estate-erp/api-client";
import type {
  MyAdsEditableField,
  MyAdsMode,
  MyAdsRequestDraft,
  MyAdsRequestDrafts,
} from "./my-ads-modes";

/** 펼친 영역의 탭 */
export type MyAdsPanelTab = "analysis" | "ads" | "requests";

/**
 * 표 칸이 읽는, 자주 바뀌는 화면 상태(모드 · 펼침 · 고치는 칸 · 요청 초안).
 *
 * 열 정의(buildColumns)에 이 값을 넣으면 값이 바뀔 때마다 열 정의가 새로 만들어지고,
 * TanStack Table은 cell 함수를 컴포넌트로 그리므로 모든 칸이 새로 마운트된다.
 * 그러면 가격 입력칸에 한 글자를 칠 때마다 입력칸이 새 노드로 바뀌어 포커스가 빠진다.
 * 그래서 열 정의는 열 구성만 따르게 두고, 바뀌는 상태는 이 컨텍스트로 칸에 건넨다.
 */
export type MyAdsTableRowState = {
  expandedIds: ReadonlySet<string>;
  /** anchor: 누른 버튼. 펼친 뒤 그 행이 같은 화면 위치에 남도록 스크롤을 맞출 때 쓴다. */
  onToggleExpanded: (id: string, anchor?: HTMLElement) => void;

  /** 지금 모드. null이면 표는 읽기 전용이다 */
  mode: MyAdsMode | null;
  /** 입력칸이 열려 있는 칸 */
  editingCell: { id: string; field: MyAdsEditableField } | null;
  /** 변경 요청 초안 (광고 id → 초안) */
  drafts: MyAdsRequestDrafts;
  onStartEdit: (
    advertisement: ListingAdvertisementWithListing,
    field: MyAdsEditableField,
  ) => void;
  /**
   * 입력한 글자를 값으로 확정한다. 받을 수 없으면 그 이유를 돌려주고 입력칸은 열린 채로 둔다.
   * 기록 수정은 저장이 끝날 때까지 기다린다(실패하면 이유를 돌려준다 — 쓴 값을 잃지 않게).
   */
  onCommitEdit: (
    advertisement: ListingAdvertisementWithListing,
    field: "primary" | "monthlyRent",
    text: string,
  ) => Promise<string | null>;
  onCancelEdit: () => void;
  /**
   * 열려 있는 입력칸이 자기 값을 확정하는 함수를 걸어 둔다. 모드를 바꾸거나 요청을 보내기 전에
   * 화면이 이것을 불러, 고치던 칸이 틀린 값이면 넘어가지 않는다.
   */
  editorCommitRef: MutableRefObject<(() => Promise<boolean>) | null>;
  /** 변경 요청 모드에서 층 노출을 바꿔 달라고 하기(다시 누르면 뺀다) */
  onToggleFloorRequest: (advertisement: ListingAdvertisementWithListing) => void;

  /** 펼친 영역의 탭 (한 번에 한 줄만 펼치므로 화면에 하나다) */
  panelTab: MyAdsPanelTab;
  onPanelTabChange: (tab: MyAdsPanelTab) => void;
  /** 값 없이 하는 요청(재광고 · 내리기)을 초안에 넣거나 뺀다 */
  onToggleDraftFlag: (
    advertisement: ListingAdvertisementWithListing,
    flag: "readvertise" | "takedown",
  ) => void;
  /** 초안에서 한 줄을 뺀다 */
  onDropDraft: (advertisementId: string, key: keyof MyAdsRequestDraft) => void;

  /** 매물과 이어지지 않은 광고의 연결 창을 연다 */
  onOpenLink: (advertisement: ListingAdvertisementWithListing) => void;
  /** 옆 상세 패널에 열려 있는 광고 */
  peekId: string | null;
  /** 옆 상세 패널을 열거나, 열려 있으면 닫는다 */
  onTogglePeek: (advertisement: ListingAdvertisementWithListing) => void;
  /** 걸어 둔 변경 요청을 거둔다 */
  onCancelRequest: (request: AdvertisementChangeRequest) => void;
  /** 거두는 중인 요청들 */
  cancellingRequestIds: ReadonlySet<string>;
};

const emptyIds: ReadonlySet<string> = new Set();
const noop = () => undefined;

/** 읽기 전용 상태. 공급자 밖(테스트 · 미리보기)에서도 칸이 그려지도록 기본값으로 둔다. */
export const MY_ADS_READ_ONLY_STATE: MyAdsTableRowState = {
  expandedIds: emptyIds,
  onToggleExpanded: noop,
  mode: null,
  editingCell: null,
  drafts: {},
  onStartEdit: noop,
  onCommitEdit: async () => null,
  onCancelEdit: noop,
  editorCommitRef: { current: null },
  onToggleFloorRequest: noop,
  panelTab: "analysis",
  onPanelTabChange: noop,
  onToggleDraftFlag: noop,
  onDropDraft: noop,
  onOpenLink: noop,
  peekId: null,
  onTogglePeek: noop,
  onCancelRequest: noop,
  cancellingRequestIds: emptyIds,
};

export const MyAdsTableStateContext = createContext<MyAdsTableRowState>(
  MY_ADS_READ_ONLY_STATE,
);

export function useMyAdsTableState(): MyAdsTableRowState {
  return useContext(MyAdsTableStateContext);
}
