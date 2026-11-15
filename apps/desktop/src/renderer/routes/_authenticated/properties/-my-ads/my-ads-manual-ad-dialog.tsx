import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, Megaphone, Pencil, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type {
  CreateListingAdvertisementDto,
  Listing,
  ListingAdvertisementWithListing,
  UpdateListingAdvertisementDto,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isNaverCpChannel } from "@/lib/advertisement-channels";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { todayInput, type AdTerms } from "../-components/property-ad-actions-state";
import { PropertyTableTransactionBadge } from "./my-ads-cells";
import { cpChannelLabel } from "./my-ads-format";
import { PROPERTY_TABLE_PILL_TONES, PROPERTY_TABLE_TAG_CLASS_NAME } from "./my-ads-pill";
import {
  activeAdChannelValues,
  assertExternalAdIdAvailable,
  buildMyAdsManualAdPayload,
  CHANGED_EXTERNAL_AD_ID_MESSAGE,
  externalAdIdToVerify,
  initialMyAdsManualAdDraft,
  isManualAdDraftChanged,
  listingMatchesSearchTokens,
  MANUAL_AD_RECENT_LIMIT,
  MANUAL_AD_RESULT_LIMIT,
  MANUAL_AD_SEARCH_DEBOUNCE_MS,
  MANUAL_AD_SEARCH_LIMIT,
  manualAdChannelOptions,
  manualAdErrorFields,
  manualAdErrorMessage,
  manualAdListingLocation,
  manualAdListingLocationParts,
  manualAdListingPriceLabel,
  manualAdListingStatusLabel,
  manualAdSuccessMessage,
  pickServerSearchToken,
  splitSearchTokens,
  type ManualAdField,
  type MyAdsManualAdDraft,
} from "./my-ads-manual-ad-state";

export type ManualAdDialogTarget =
  | { mode: "create" }
  | { mode: "edit"; advertisement: ListingAdvertisementWithListing };

/** 열 때마다 id를 새로 붙여 입력 상태를 처음부터 시작한다. 닫는 동안에는 마지막 세션을 그대로 그린다. */
export type ManualAdDialogSession = { id: number; target: ManualAdDialogTarget };

type Submission =
  | {
      mode: "create";
      payload: CreateListingAdvertisementDto;
      verifyExternalAdId: ReturnType<typeof externalAdIdToVerify>;
    }
  | {
      mode: "edit";
      advertisementId: string;
      payload: UpdateListingAdvertisementDto;
      verifyExternalAdId: ReturnType<typeof externalAdIdToVerify>;
    };

type FormError = { message: string; fields: ManualAdField[] | null };

// 매물관리 펼침 패널의 수동 추가 다이얼로그와 같은 입력 모양
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive";
const INVALIDATED_QUERY_KEYS = [
  "listing-advertisements",
  "listings",
  "listing-intakes",
  "properties",
] as const;

export function MyAdsManualAdDialog({
  session,
  open,
  onOpenChange,
  getReturnFocusTarget,
}: {
  session: ManualAdDialogSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 닫은 뒤 포커스를 돌려줄 곳(연 버튼). 그 버튼이 사라졌거나, 방금 저장한 광고가 목록에서
   * 빠질 것이면(leftList) 다른 곳을 돌려준다.
   */
  getReturnFocusTarget: (options: { leftList: boolean }) => HTMLElement | null;
}) {
  // Esc·✕·취소로 닫으려 할 때 내용 쪽이 막을 수 있게 한다. 입력한 내용이 있으면 바로 버리지 않고 묻는다.
  const closeGuardRef = useRef<(() => boolean) | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && closeGuardRef.current?.()) return;
        onOpenChange(next);
      }}
    >
      {session && (
        <ManualAdDialogContent
          key={session.id}
          target={session.target}
          closeGuardRef={closeGuardRef}
          onClose={() => onOpenChange(false)}
          getReturnFocusTarget={getReturnFocusTarget}
        />
      )}
    </Dialog>
  );
}

function ManualAdDialogContent({
  target,
  closeGuardRef,
  onClose,
  getReturnFocusTarget,
}: {
  target: ManualAdDialogTarget;
  closeGuardRef: RefObject<(() => boolean) | null>;
  /** 확인 없이 닫는다(저장 성공 · 버리고 닫기) */
  onClose: () => void;
  getReturnFocusTarget: (options: { leftList: boolean }) => HTMLElement | null;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const editing = target.mode === "edit" ? target.advertisement : undefined;
  const [listing, setListing] = useState<Listing | null>(
    editing?.listing ?? null,
  );
  // 매물을 고른 순간(수정이면 연 순간)의 입력값. 이것과 달라졌을 때만 닫기 전에 묻는다.
  const [baseline, setBaseline] = useState<MyAdsManualAdDraft | null>(() =>
    editing?.listing ? initialMyAdsManualAdDraft(editing.listing, editing) : null,
  );
  const [draft, setDraft] = useState<MyAdsManualAdDraft | null>(baseline);
  const [error, setError] = useState<FormError | null>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  // "다시 고르기"로 돌아와도 검색어가 남도록 고르기 단계 밖에 둔다.
  const [listingQuery, setListingQuery] = useState("");
  const submitting = useRef(false);
  // 저장한 광고가 게재 중 목록에서 빠지면(종료) 연 버튼도 곧 사라지므로 등록 버튼으로 돌아간다.
  const leftListRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<HTMLSelectElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const discardReturnFocusRef = useRef<HTMLElement | null>(null);
  const errorId = `${id}-error`;

  const mutation = useMutation({
    mutationFn: async (submission: Submission) => {
      // 게재 중인 (채널, CP 광고번호)는 하나뿐이다. 서버는 겹치면 500으로 끝나므로 먼저 확인한다.
      if (submission.verifyExternalAdId) {
        const { channel, externalAdId } = submission.verifyExternalAdId;
        const found = await api.listingAdvertisements.findAll({
          channel,
          status: "active",
          search: externalAdId,
          limit: 100,
        });
        assertExternalAdIdAvailable(found.items, submission.verifyExternalAdId);
      }
      return submission.mode === "create"
        ? api.listingAdvertisements.create(submission.payload)
        : api.listingAdvertisements.update(
            submission.advertisementId,
            submission.payload,
          );
    },
    onSuccess: (_saved, submission) => {
      // 저장 응답이 오면 바로 닫는다. 목록 다시 읽기는 뒤에서 진행되고 기다리지 않는다.
      for (const key of INVALIDATED_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      leftListRef.current = submission.payload.status === "ended";
      toast.success(manualAdSuccessMessage(submission.mode, submission.payload));
      onClose();
    },
    // 서버 오류(중복 등)는 다이얼로그 안에 보여 주고 입력은 그대로 둔다.
    onError: (err) => showError(manualAdErrorMessage(err)),
    onSettled: () => {
      submitting.current = false;
    },
  });
  const isPending = mutation.isPending;
  const isDirty =
    baseline != null && draft != null && isManualAdDraftChanged(baseline, draft);

  function openDiscardConfirm() {
    if (isConfirmingDiscard) {
      keepEditingRef.current?.focus();
      return;
    }
    discardReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    flushSync(() => setIsConfirmingDiscard(true));
    keepEditingRef.current?.focus();
  }

  function closeDiscardConfirm() {
    flushSync(() => setIsConfirmingDiscard(false));
    const previous = discardReturnFocusRef.current;
    if (previous?.isConnected) previous.focus();
  }

  // Esc·✕·취소: 저장 중이면 닫지 않고, 입력한 내용이 있으면 버릴지 먼저 묻는다(true = 닫기를 막음).
  function blockClose() {
    if (submitting.current) return true;
    if (isDirty) {
      openDiscardConfirm();
      return true;
    }
    return false;
  }
  // 바깥 Dialog가 닫기 요청마다 지금 상태로 판단하도록 매번 바꿔 끼운다.
  useEffect(() => {
    closeGuardRef.current = blockClose;
  });
  useEffect(
    () => () => {
      closeGuardRef.current = null;
    },
    [closeGuardRef],
  );

  function requestClose() {
    if (!blockClose()) onClose();
  }

  /** 검증 문구를 보이고, 문제가 된 첫 칸으로 포커스를 옮긴다(스크롤 영역 밖이어도 보이게). */
  function showError(message: string) {
    const fields = manualAdErrorFields(message);
    flushSync(() => setError({ message, fields }));
    for (const field of fields ?? []) {
      const element = document.getElementById(fieldElementId(id, field));
      if (
        element instanceof HTMLElement &&
        !element.matches(":disabled, [readonly]")
      ) {
        element.focus();
        return;
      }
    }
  }

  function selectListing(next: Listing) {
    const nextDraft = initialMyAdsManualAdDraft(next);
    flushSync(() => {
      setListing(next);
      setBaseline(nextDraft);
      setDraft(nextDraft);
      setError(null);
    });
    channelRef.current?.focus();
  }

  function clearListing() {
    flushSync(() => {
      setListing(null);
      setBaseline(null);
      setDraft(null);
      setError(null);
      setIsConfirmingDiscard(false);
    });
    searchInputRef.current?.focus();
  }

  /** 칸을 고치면, 그 칸을 가리키던(또는 어느 칸도 가리키지 않던) 오류 문구를 지운다. */
  const patchDraft = (patch: Partial<MyAdsManualAdDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setError((current) =>
      current &&
      (current.fields == null ||
        (Object.keys(patch) as ManualAdField[]).some((field) =>
          current.fields?.includes(field),
        ))
        ? null
        : current,
    );
  };

  /** 오류 문구가 가리키는 칸: 빨간 테두리와 문구 연결 */
  const invalidProps = (field: ManualAdField, describedBy?: string) => {
    const invalid = Boolean(error?.fields?.includes(field));
    const ids = [describedBy, invalid ? errorId : undefined].filter(Boolean);
    return {
      "aria-invalid": invalid || undefined,
      "aria-describedby": ids.length ? ids.join(" ") : undefined,
    };
  };

  function submit() {
    if (!listing || !draft || submitting.current) return;
    setError(null);
    try {
      let submission: Submission;
      if (editing) {
        const payload = buildMyAdsManualAdPayload(listing, draft, editing);
        submission = {
          mode: "edit",
          advertisementId: editing.id,
          payload,
          verifyExternalAdId: externalAdIdToVerify(payload, editing),
        };
      } else {
        const payload = buildMyAdsManualAdPayload(listing, draft);
        submission = {
          mode: "create",
          payload,
          verifyExternalAdId: externalAdIdToVerify(payload),
        };
      }
      submitting.current = true;
      mutation.mutate(submission);
    } catch (err) {
      showError(err instanceof Error ? err.message : "입력한 내용을 확인해 주세요.");
    }
  }

  const title = editing ? "수동 광고 수정" : "광고 수동 추가";
  const description = editing
    ? "직접 입력한 광고라 업무 요청 없이 바로 저장합니다. 광고 채널의 실제 게재 내용은 변경되지 않습니다."
    : "앱에 광고 정보를 기록합니다. 광고 채널의 실제 게재 내용은 변경되지 않습니다.";

  return (
    <DialogContent
      // 광고업무 다이얼로그와 같은 높이 상한. 입력 칸이 많으면 가운데 영역만 스크롤된다.
      className="flex max-h-[min(88svh,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      showCloseButton={!isPending}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (isPending) {
          event.preventDefault();
        } else if (isConfirmingDiscard) {
          // 묻는 중의 Esc는 "계속 입력"이다. 확인 없이 버리지 않는다.
          event.preventDefault();
          closeDiscardConfirm();
        }
        // 그 밖에는 닫기 요청으로 넘어가고, 입력이 있으면 closeGuard가 묻는 쪽으로 바꾼다.
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        getReturnFocusTarget({ leftList: leftListRef.current })?.focus();
      }}
    >
      {/* 머리: 광고업무 다이얼로그(my-ads-action-dialog)와 같은 아이콘 · 제목 · 설명 구성 */}
      <DialogHeader className="border-b px-6 py-5 pr-12">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"
          >
            {editing ? <Pencil className="size-4" /> : <Megaphone className="size-4" />}
          </span>
          <div>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {description}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {editing && !editing.listing ? (
        <>
          <p role="alert" className="px-6 py-5 text-[13px] text-destructive">
            광고의 매물 정보를 불러오지 못했습니다. 목록을 다시 불러온 뒤 시도해 주세요.
          </p>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              닫기
            </Button>
          </DialogFooter>
        </>
      ) : !listing || !draft ? (
        <>
          <ListingPicker
            id={id}
            inputRef={searchInputRef}
            query={listingQuery}
            onQueryChange={setListingQuery}
            onSelect={selectListing}
          />
          <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              광고를 붙일 매물의 거래 옵션을 먼저 고르세요.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={requestClose}>
              취소
            </Button>
          </DialogFooter>
        </>
      ) : (
        <form
          // 브라우저 말풍선 대신 앱의 검증 문구만 쓴다(주소·날짜 형식도 buildManualAdPayload가 본다).
          noValidate
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {/*
            스크롤 상자는 div다. Chromium은 flex로 높이가 정해진 fieldset을 스크롤하지 않아
            칸이 아래 버튼 줄 밑으로 들어갔다. fieldset은 저장 중 일괄 비활성화만 맡는다.
          */}
          <div
            data-manual-ad-form-scroll
            className="min-h-0 flex-1 scroll-py-4 overflow-y-auto px-6 py-4"
            onFocus={(event) => {
              // Tab이나 오류로 칸에 들어오면 이름까지 칸 전체가 보이게 맞춘다.
              // Chromium은 칸이 조금이라도 보이면 스크롤하지 않아 아래 칸이 버튼 줄 뒤에 반쯤 가려졌다.
              const target = event.target as HTMLElement;
              (target.closest("[data-manual-ad-field]") ?? target).scrollIntoView({
                block: "nearest",
              });
            }}
          >
            <fieldset
              disabled={isPending}
              className="min-w-0 space-y-4 disabled:opacity-60"
            >
              <SelectedListingSummary
                listing={listing}
                showActiveChannels={!editing}
                onChange={editing ? undefined : clearListing}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="광고 채널" id={`${id}-channel`}>
                  <select
                    ref={channelRef}
                    id={`${id}-channel`}
                    className={selectClass}
                    value={draft.channel}
                    disabled={Boolean(editing)}
                    onChange={(event) => patchDraft({ channel: event.target.value })}
                    {...invalidProps("channel")}
                  >
                    {editing ? (
                      <option value={draft.channel}>
                        {cpChannelLabel(draft.channel)}
                      </option>
                    ) : (
                      <>
                        {!isNaverCpChannel(draft.channel) && (
                          <option value={draft.channel} disabled>
                            {cpChannelLabel(draft.channel)}
                          </option>
                        )}
                        {manualAdChannelOptions(listing, draft.status).map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                          >
                            {option.label}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </Field>
                <Field label="상태" id={`${id}-status`}>
                  <select
                    id={`${id}-status`}
                    className={selectClass}
                    value={draft.status}
                    onChange={(event) => {
                      const status = event.target.value as "active" | "ended";
                      patchDraft({
                        status,
                        endedAt:
                          status === "ended" ? draft.endedAt || todayInput() : "",
                      });
                    }}
                    {...invalidProps("status")}
                  >
                    <option value="active">광고 중</option>
                    <option value="ended">종료</option>
                  </select>
                </Field>
              </div>
              <MoneyFields
                id={id}
                trade={listing.transactionType}
                value={draft}
                onChange={patchDraft}
                invalidProps={invalidProps}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="등록일" id={`${id}-start`}>
                  <Input
                    id={`${id}-start`}
                    type="date"
                    value={draft.startedAt}
                    onChange={(event) => patchDraft({ startedAt: event.target.value })}
                    {...invalidProps("startedAt")}
                  />
                </Field>
                {draft.status === "ended" && (
                  <Field label="종료일" id={`${id}-end`}>
                    <Input
                      id={`${id}-end`}
                      type="date"
                      required
                      value={draft.endedAt}
                      onChange={(event) => patchDraft({ endedAt: event.target.value })}
                      {...invalidProps("endedAt")}
                    />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="CP 광고번호"
                  id={`${id}-external`}
                  hint={
                    editing?.externalAdId ? CHANGED_EXTERNAL_AD_ID_MESSAGE : undefined
                  }
                >
                  <Input
                    id={`${id}-external`}
                    placeholder="미입력"
                    autoComplete="off"
                    readOnly={Boolean(editing?.externalAdId)}
                    value={draft.externalAdId}
                    onChange={(event) => patchDraft({ externalAdId: event.target.value })}
                    {...invalidProps(
                      "externalAdId",
                      editing?.externalAdId ? `${id}-external-hint` : undefined,
                    )}
                  />
                </Field>
                <Field label="네이버 매물번호" id={`${id}-naver`}>
                  <Input
                    id={`${id}-naver`}
                    inputMode="numeric"
                    placeholder="미입력"
                    autoComplete="off"
                    value={draft.naverArticleNo}
                    onChange={(event) =>
                      patchDraft({ naverArticleNo: event.target.value })
                    }
                    {...invalidProps("naverArticleNo")}
                  />
                </Field>
              </div>
              <Field label="원문 주소" id={`${id}-url`}>
                <Input
                  id={`${id}-url`}
                  type="url"
                  placeholder="https://"
                  value={draft.url}
                  onChange={(event) => patchDraft({ url: event.target.value })}
                  {...invalidProps("url")}
                />
              </Field>
              <Field label="메모" id={`${id}-memo`}>
                <Textarea
                  id={`${id}-memo`}
                  className="min-h-20 resize-y"
                  value={draft.memo}
                  onChange={(event) => patchDraft({ memo: event.target.value })}
                />
              </Field>
            </fieldset>
          </div>
          {error && (
            <p
              id={errorId}
              role="alert"
              className="shrink-0 border-t px-6 py-2.5 text-[13px] text-destructive"
            >
              {error.message}
            </p>
          )}
          {isConfirmingDiscard ? (
            <DialogFooter className="shrink-0 items-center border-t px-6 py-4 sm:justify-between">
              <p id={`${id}-discard`} className="text-[13px] text-foreground">
                입력한 내용을 저장하지 않고 닫을까요?
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  ref={keepEditingRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-describedby={`${id}-discard`}
                  onClick={closeDiscardConfirm}
                >
                  계속 입력
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-describedby={`${id}-discard`}
                  onClick={onClose}
                >
                  버리고 닫기
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={requestClose}
              >
                취소
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                {isPending ? "저장 중…" : editing ? "변경 저장" : "광고 추가"}
              </Button>
            </DialogFooter>
          )}
        </form>
      )}
    </DialogContent>
  );
}

/** 오류 문구가 가리키는 칸의 입력 요소 id (MoneyFields는 `${id}-${칸 이름}`) */
function fieldElementId(id: string, field: ManualAdField): string {
  const ids: Partial<Record<ManualAdField, string>> = {
    channel: `${id}-channel`,
    status: `${id}-status`,
    startedAt: `${id}-start`,
    endedAt: `${id}-end`,
    externalAdId: `${id}-external`,
    naverArticleNo: `${id}-naver`,
    url: `${id}-url`,
    memo: `${id}-memo`,
  };
  return ids[field] ?? `${id}-${field}`;
}

/**
 * 1단계: 단지·동·호·메모로 사무소의 매물 거래 옵션을 찾는다.
 * 입력칸에 포커스를 둔 채 ↑↓로 결과를 옮기고 Enter로 고른다(콤보박스 + 목록 상자).
 */
function ListingPicker({
  id,
  inputRef,
  query,
  onQueryChange,
  onSelect,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (listing: Listing) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, MANUAL_AD_SEARCH_DEBOUNCE_MS);
  // 서버 요청만 250ms 기다린다. 받은 결과는 지금 입력한 낱말로 바로 거르므로
  // 화면에 보이는(Enter로 고를 수 있는) 결과는 언제나 현재 입력과 맞는다.
  const tokens = useMemo(() => splitSearchTokens(query), [query]);
  const serverToken = pickServerSearchToken(splitSearchTokens(debouncedQuery));
  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["listings", "manual-ad-picker", serverToken ?? ""],
    // 종결된 의뢰는 서버 기본값으로 빠진다. 검색어가 없으면 최근 수정한 매물부터 보여 준다.
    queryFn: () =>
      api.listings.findAll(
        serverToken
          ? { search: serverToken, limit: MANUAL_AD_SEARCH_LIMIT }
          : {
              limit: MANUAL_AD_RECENT_LIMIT,
              sortBy: "updatedAt",
              sortOrder: "desc",
            },
      ),
    placeholderData: keepPreviousData,
  });
  const matched = useMemo(
    () =>
      (data?.items ?? []).filter((listing) =>
        listingMatchesSearchTokens(listing, tokens),
      ),
    [data, tokens],
  );
  const results = matched.slice(0, MANUAL_AD_RESULT_LIMIT);
  const hasMore =
    matched.length > results.length ||
    (serverToken != null && (data?.pagination.total ?? 0) > (data?.items.length ?? 0));
  const activeOption = results.length ? Math.min(activeIndex, results.length - 1) : -1;
  const optionId = (listing: Listing) => `${id}-option-${listing.id}`;
  const listboxId = `${id}-listings`;
  // 입력이 멈추길 기다리거나 새 검색어로 받는 중 — 빈 결과를 "없음"으로 말하지 않는다.
  const isWaiting =
    isLoading ||
    query.trim() !== debouncedQuery.trim() ||
    (isFetching && isPlaceholderData);

  function moveActive(step: number) {
    if (!results.length) return;
    const next = (activeOption + step + results.length) % results.length;
    setActiveIndex(next);
    document
      .getElementById(optionId(results[next]))
      ?.scrollIntoView({ block: "nearest" });
  }

  const statusText = isWaiting
    ? "매물을 찾는 중입니다."
    : isError
      ? "매물을 불러오지 못했습니다."
      : results.length
        ? `${tokens.length ? "검색된" : "최근 수정한"} 매물 ${results.length}건${hasMore ? " 이상" : ""}`
        : tokens.length
          ? "조건에 맞는 매물이 없습니다."
          : "등록된 매물이 없습니다.";

  return (
    <div className="flex min-h-0 shrink flex-col gap-2 px-6 py-4">
      <label htmlFor={`${id}-search`} className="block text-xs text-muted-foreground">
        매물 검색
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={`${id}-search`}
          autoFocus
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={results.length > 0 ? listboxId : undefined}
          aria-activedescendant={
            activeOption >= 0 ? optionId(results[activeOption]) : undefined
          }
          aria-describedby={`${id}-search-hint`}
          placeholder="단지명, 동, 호, 메모"
          className="pl-8"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (activeOption >= 0) onSelect(results[activeOption]);
            }
          }}
        />
        {(isFetching || isWaiting) && (
          <Loader2
            aria-hidden="true"
            className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>
      <p id={`${id}-search-hint`} className="text-xs text-muted-foreground">
        ↑↓로 고르고 Enter로 선택합니다. 종결된 의뢰의 매물은 나오지 않습니다.
      </p>
      <p aria-live="polite" className="sr-only">
        {statusText}
      </p>

      {/*
        결과 영역은 높이를 고정한다. 결과 수에 따라 다이얼로그 높이가 바뀌면 화면 가운데로 다시 맞춰지며
        입력칸이 위아래로 튀었다. 창이 낮으면 이 영역만 줄어든다.
      */}
      <div
        data-manual-ad-results
        className="flex h-[320px] min-h-0 shrink flex-col gap-2"
      >
        {isError ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
            매물을 불러오지 못했습니다.
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => void refetch()}
            >
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {isWaiting ? "매물을 찾는 중…" : statusText}
          </p>
        ) : (
          <>
            <ul
              id={listboxId}
              role="listbox"
              aria-label={tokens.length ? "검색된 매물" : "최근 수정한 매물"}
              className="min-h-0 overflow-y-auto rounded-md border"
            >
              {results.map((listing, index) => (
                <ListingOption
                  key={listing.id}
                  id={optionId(listing)}
                  listing={listing}
                  active={index === activeOption}
                  onHover={() => setActiveIndex(index)}
                  onSelect={() => onSelect(listing)}
                />
              ))}
            </ul>
            {hasMore && (
              <p className="shrink-0 text-xs text-muted-foreground">
                결과가 많아 일부만 보입니다. 동·호를 함께 입력해 보세요.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListingOption({
  id,
  listing,
  active,
  onHover,
  onSelect,
}: {
  id: string;
  listing: Listing;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const status = manualAdListingStatusLabel(listing);
  const channels = activeAdChannelValues(listing).map(cpChannelLabel);
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // 입력칸 포커스를 유지한 채 고른다
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-b px-3 py-2 last:border-b-0",
        active && "bg-muted",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <ListingLocation listing={listing} className="text-foreground" />
        <PropertyTableTransactionBadge transactionType={listing.transactionType} />
        {status && (
          <span
            className={cn(
              PROPERTY_TABLE_TAG_CLASS_NAME,
              "shrink-0",
              PROPERTY_TABLE_PILL_TONES.neutral,
            )}
          >
            {status}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[13px] tabular-nums text-foreground">
          {manualAdListingPriceLabel(listing)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {channels.length ? `광고 중: ${channels.join(", ")}` : "진행 중인 광고 없음"}
      </p>
    </li>
  );
}

/** 단지명만 말줄임하고 동·호는 늘 보인다. 잘린 이름은 title로 전체 위치를 보여 준다. */
function ListingLocation({
  listing,
  className,
}: {
  listing: Listing;
  className?: string;
}) {
  const { site, unit } = manualAdListingLocationParts(listing);
  return (
    <span
      title={manualAdListingLocation(listing)}
      className={cn(
        "flex min-w-0 items-baseline gap-1 text-[13px] font-medium",
        className,
      )}
    >
      {site && <span className="min-w-0 truncate">{site}</span>}
      {unit && <span className="shrink-0 whitespace-nowrap">{unit}</span>}
      {!site && !unit && <span className="truncate">매물</span>}
    </span>
  );
}

function SelectedListingSummary({
  listing,
  showActiveChannels,
  onChange,
}: {
  listing: Listing;
  showActiveChannels: boolean;
  onChange?: () => void;
}) {
  const status = manualAdListingStatusLabel(listing);
  const channels = activeAdChannelValues(listing).map(cpChannelLabel);
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <ListingLocation listing={listing} />
          <PropertyTableTransactionBadge transactionType={listing.transactionType} />
          {status && (
            <span
              className={cn(
                PROPERTY_TABLE_TAG_CLASS_NAME,
                "shrink-0",
                PROPERTY_TABLE_PILL_TONES.neutral,
              )}
            >
              {status}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          매물 가격 {manualAdListingPriceLabel(listing)}
          {showActiveChannels &&
            ` · ${channels.length ? `광고 중: ${channels.join(", ")}` : "진행 중인 광고 없음"}`}
        </p>
      </div>
      {onChange && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onChange}
        >
          다시 고르기
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div data-manual-ad-field className="space-y-1.5">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[11px] leading-4 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function MoneyFields({
  id,
  trade,
  value,
  onChange,
  invalidProps,
}: {
  id: string;
  trade: string;
  value: AdTerms;
  onChange: (patch: Partial<AdTerms>) => void;
  invalidProps: (field: keyof AdTerms) => {
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  };
}) {
  const fields: { key: keyof AdTerms; label: string }[] =
    trade === "monthly"
      ? [
          { key: "advertisedDeposit", label: "보증금" },
          { key: "advertisedMonthlyRent", label: "월세" },
        ]
      : [
          {
            key: trade === "sale" ? "advertisedPrice" : "advertisedDeposit",
            label: trade === "sale" ? "매매가" : "전세가",
          },
        ];
  return (
    <div
      className={cn("grid gap-3", fields.length > 1 ? "grid-cols-2" : "grid-cols-1")}
    >
      {fields.map(({ key, label }) => (
        <Field key={key} id={`${id}-${key}`} label={`${label} · 만원`}>
          <Input
            id={`${id}-${key}`}
            type="text"
            inputMode="numeric"
            placeholder="미입력"
            value={value[key]}
            onChange={(event) => onChange({ [key]: event.target.value })}
            {...invalidProps(key)}
          />
        </Field>
      ))}
    </div>
  );
}
