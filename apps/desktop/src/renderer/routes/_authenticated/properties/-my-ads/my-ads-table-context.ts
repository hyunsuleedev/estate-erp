import { createContext, useContext } from "react";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import type { InlinePriceEdit } from "./my-ads-types";

/**
 * 표 칸이 읽는, 자주 바뀌는 화면 상태(선택·펼침·인라인 수정값).
 *
 * 열 정의(buildColumns)에 이 값을 넣으면 값이 바뀔 때마다 열 정의가 새로 만들어지고,
 * TanStack Table은 cell 함수를 컴포넌트로 그리므로 모든 칸이 새로 마운트된다.
 * 그러면 가격 입력칸에 한 글자를 칠 때마다 입력칸이 새 노드로 바뀌어 포커스가 빠진다.
 * 그래서 열 정의는 열 구성만 따르게 두고, 바뀌는 상태는 이 컨텍스트로 칸에 건넨다.
 */
export type MyAdsTableRowState = {
  expandedIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  inlineEdits: Readonly<Record<string, InlinePriceEdit>>;
  /** anchor: 누른 버튼. 펼친 뒤 그 행이 같은 화면 위치에 남도록 스크롤을 맞출 때 쓴다. */
  onToggleExpanded: (id: string, anchor?: HTMLElement) => void;
  onInlineEditChange: (
    advertisement: ListingAdvertisementWithListing,
    patch: Partial<InlinePriceEdit>,
  ) => void;
  onInlineEditReset: (advertisementId: string) => void;
};

const emptyIds: ReadonlySet<string> = new Set();
const noop = () => undefined;

/** 공급자 밖(테스트·미리보기)에서도 칸이 그려지도록 아무것도 고르지 않은 상태를 기본값으로 둔다. */
export const MyAdsTableStateContext = createContext<MyAdsTableRowState>({
  expandedIds: emptyIds,
  selectedIds: emptyIds,
  inlineEdits: {},
  onToggleExpanded: noop,
  onInlineEditChange: noop,
  onInlineEditReset: noop,
});

export function useMyAdsTableState(): MyAdsTableRowState {
  return useContext(MyAdsTableStateContext);
}
