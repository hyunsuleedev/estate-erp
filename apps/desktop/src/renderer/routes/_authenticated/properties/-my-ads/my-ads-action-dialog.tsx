import { Loader2, Pencil, Send, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  cpChannelLabel,
  getCanonicalLocation,
  observedAdvertisementPriceLabel,
} from "./my-ads-format";
import type { AdvertisementActionDraft } from "./my-ads-types";

export function AdvertisementActionDialog({
  open,
  drafts,
  rationale,
  isSubmitting,
  onOpenChange,
  onDraftChange,
  onRationaleChange,
  onSubmit,
}: {
  open: boolean;
  drafts: AdvertisementActionDraft[];
  rationale: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (
    advertisementId: string,
    patch: Partial<AdvertisementActionDraft>,
  ) => void;
  onRationaleChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88svh,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Pencil className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-base">광고업무 만들기</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                네이버 비교 근거를 보면서 요청할 최종 조건을 편집합니다. 등록된
                업무는 사용자가 실행한 외부 AI의 로컬 Skill이 처리합니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(200px,1fr)_minmax(240px,auto)_132px] items-center gap-4 border-b bg-[#f7f7f5] px-6 py-2 text-[11px] font-medium text-slate-500">
            <span>광고</span>
            <span>요청할 최종 조건 · 만원</span>
            <span className="text-right">저장 후 재광고</span>
          </div>
          {drafts.map((draft) => {
            const advertisement = draft.advertisement;
            const location = getCanonicalLocation(advertisement);
            const transactionType =
              advertisement.listing?.transactionType ?? "sale";
            const recommendedMin =
              transactionType === "monthly"
                ? null
                : advertisement.officeAdvertisementGroup?.relatedPriceMin;
            return (
              <div
                key={advertisement.id}
                className="grid grid-cols-[minmax(200px,1fr)_minmax(240px,auto)_132px] items-center gap-4 border-b px-6 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-slate-900">
                      {location.site}
                    </span>
                    <StatusBadge
                      kind="transactionType"
                      status={transactionType}
                      size="sm"
                    />
                    <span className="truncate text-xs text-slate-600">
                      {[location.dong, location.floor, location.ho]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate text-[11px] text-muted-foreground"
                    title={`${cpChannelLabel(advertisement.channel)} ${advertisement.externalAdId ?? "광고번호 없음"} · 네이버 ${advertisement.naverArticleNo ?? "연결 대기"}`}
                  >
                    네이버 관측 {observedAdvertisementPriceLabel(advertisement)}
                    {" · "}
                    {cpChannelLabel(advertisement.channel)}{" "}
                    {advertisement.externalAdId ?? "광고번호 없음"}
                  </p>
                </div>

                <div className="min-w-0">
                  {transactionType === "monthly" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <MoneyDraftField
                        id={`${advertisement.id}-deposit`}
                        label="보증금"
                        value={draft.advertisedDeposit}
                        onChange={(value) =>
                          onDraftChange(advertisement.id, {
                            advertisedDeposit: value,
                          })
                        }
                      />
                      <MoneyDraftField
                        id={`${advertisement.id}-monthly-rent`}
                        label="월세"
                        value={draft.advertisedMonthlyRent}
                        onChange={(value) =>
                          onDraftChange(advertisement.id, {
                            advertisedMonthlyRent: value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <MoneyDraftField
                      id={`${advertisement.id}-primary-price`}
                      label={transactionType === "jeonse" ? "전세가" : "매매가"}
                      value={
                        transactionType === "jeonse"
                          ? draft.advertisedDeposit
                          : draft.advertisedPrice
                      }
                      onChange={(value) =>
                        onDraftChange(
                          advertisement.id,
                          transactionType === "jeonse"
                            ? { advertisedDeposit: value }
                            : { advertisedPrice: value },
                        )
                      }
                    />
                  )}
                  {recommendedMin != null && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-medium text-info hover:underline"
                      onClick={() =>
                        onDraftChange(
                          advertisement.id,
                          transactionType === "sale"
                            ? { advertisedPrice: String(recommendedMin) }
                            : { advertisedDeposit: String(recommendedMin) },
                        )
                      }
                    >
                      비교 최저가 {formatMoney(recommendedMin)} 적용
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <Switch
                    id={`${advertisement.id}-republish`}
                    size="sm"
                    checked={draft.republishAfterSave}
                    onCheckedChange={(checked) =>
                      onDraftChange(advertisement.id, {
                        republishAfterSave: checked,
                      })
                    }
                    aria-label={`${location.site} 저장 후 재광고`}
                    title={
                      draft.republishAfterSave
                        ? "조건 저장 후 이실장 바로 재광고 요청"
                        : "조건만 저장하고 현재 광고 순서는 유지"
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t bg-[#fbfbfa] px-6 py-3">
          <Label htmlFor="my-ads-action-rationale" className="text-xs">
            요청사항
          </Label>
          <Textarea
            id="my-ads-action-rationale"
            value={rationale}
            onChange={(event) => onRationaleChange(event.target.value)}
            placeholder="예: 동일 호실 최저가와 맞추고 오늘자로 재광고"
            className="mt-1.5 min-h-12 resize-none bg-white text-xs"
          />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              선택한 광고는 하나의 일반 업무로 등록됩니다. 세부 실행 단계와
              재시도는 로컬 Skill에만 남고, CP 저장값을 다시 읽어 일치할 때만
              업무를 완료합니다.
            </span>
          </p>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={isSubmitting || drafts.length === 0}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {drafts.length}건 광고업무 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoneyDraftField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={id}
        className="w-12 shrink-0 text-[11px] text-muted-foreground"
      >
        {label}
      </Label>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 bg-white pr-10 text-right text-xs tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-muted-foreground">
          만원
        </span>
      </div>
    </div>
  );
}
