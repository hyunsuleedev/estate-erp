import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatPrice } from '@estate-erp/shared';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import {
  CalendarDays,
  ExternalLink,
  Info,
  Megaphone,
  PencilLine,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { isNaverCpChannel, naverCpChannels } from '@/lib/advertisement-channels';
import { cn } from '@/lib/utils';
import { WonCircleIcon } from '@/components/domain';
import { EditableCell } from '@/components/data-table';
import { CellTableNavigationProvider } from '@/components/data-table/cell-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { transactionTypeMeta } from '../-detail/model';
import type { PropertyListingGroup } from './property-listings-table';
import type { AdListing } from './property-ad-actions-state';
import { PropertyAdEditableCell } from './property-ad-editable-cell';
import { AdTableColumnHeader } from './property-ad-table-controls';
import {
  adTableColumns,
  getAdChannelLabel,
  sortPropertyAdRows,
  type AdColumnId,
  type AdTableControls,
} from './property-ad-table-state';
import { PropertyPanelSelectionCheckbox } from './property-panel-selection-checkbox';
import {
  currentPropertyAdAmount,
  defaultPublishAmounts,
  formatRequestPrice,
  getOpenPropertyAdRequest,
  REQUEST_STATUS_LABELS,
  requestedActionForPropertyAd,
  requestedAmountForPropertyAd,
} from './property-ad-request-drafts';

const adStatusMeta: Record<string, { label: string; className: string }> = {
  active: { label: '광고중', className: 'bg-[#eef3ed] text-[#44745a]' },
  ended: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' }, // i18n: ad
};

const ACTION_LABELS: Record<'readvertise' | 'takedown', string> = {
  readvertise: '재광고',
  takedown: '내리기',
};

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function AdTradeBadge({ transactionType }: { transactionType: string }) {
  const meta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded-[3px] px-1.5 py-0 text-[13px] font-normal leading-none',
        meta?.className ?? 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      {meta?.label ?? transactionType}
    </span>
  );
}

function StatusRequestCell({
  advertisement,
  requestMode,
  requestedAction,
  hasOpenRequest,
  onToggleFlag,
  onClearFlag,
  children,
}: {
  advertisement: ListingAdvertisement;
  requestMode: boolean;
  requestedAction: {
    kind: 'draft' | 'pending';
    action: 'readvertise' | 'takedown';
    status?: string;
  } | null;
  hasOpenRequest: boolean;
  onToggleFlag?: (advertisementId: string, flag: 'readvertise' | 'takedown') => void;
  onClearFlag?: (advertisementId: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const content = (
    <div className="flex min-w-0 flex-col justify-center py-0.5">
      <div>{children}</div>
      {requestedAction && (
        <span
          data-property-ad-requested-action={requestedAction.action}
          data-request-origin={requestedAction.kind}
          title={
            requestedAction.kind === 'pending' && requestedAction.status
              ? `요청 상태: ${REQUEST_STATUS_LABELS[requestedAction.status] ?? requestedAction.status}`
              : '요청 초안'
          }
          className={cn(
            'mt-0.5 block truncate text-[12px] font-medium leading-[15px]',
            requestedAction.kind === 'pending'
              ? 'text-primary'
              : requestedAction.action === 'takedown'
                ? 'text-destructive'
                : 'text-info',
          )}
        >
          → {ACTION_LABELS[requestedAction.action]}
        </span>
      )}
    </div>
  );

  if (!requestMode) return <div className="px-2.5">{content}</div>;
  if (advertisement.status !== 'active' || hasOpenRequest || !onToggleFlag) {
    return (
      <div
        className="cursor-not-allowed px-2.5 opacity-60"
        title={
          hasOpenRequest
            ? '처리 중인 요청이 이미 있습니다.'
            : '게재 중인 광고만 요청할 수 있습니다.'
        }
      >
        {content}
      </div>
    );
  }

  const currentAction =
    requestedAction?.kind === 'draft' ? requestedAction.action : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="광고 상태 변경 요청 선택"
          className="flex min-h-9 w-full items-center px-2.5 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]"
        >
          {content}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-40 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onClearFlag?.(advertisement.id);
            setOpen(false);
          }}
          className={cn(
            'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted',
            currentAction === null && 'font-medium text-foreground',
          )}
        >
          유지
          {currentAction === null && <span className="text-xs text-muted-foreground">선택됨</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleFlag(advertisement.id, 'readvertise');
            setOpen(false);
          }}
          className={cn(
            'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted',
            currentAction === 'readvertise' && 'font-medium text-info',
          )}
        >
          재광고
          {currentAction === 'readvertise' && <span className="text-xs">✓</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleFlag(advertisement.id, 'takedown');
            setOpen(false);
          }}
          className={cn(
            'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-muted',
            currentAction === 'takedown' && 'font-medium',
          )}
        >
          광고 내리기
          {currentAction === 'takedown' && <span className="text-xs">✓</span>}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function RequestMoneyCell({
  listing,
  advertisement,
  field,
  label,
  currentText,
  requested,
  requestMode,
  hasOpenRequest,
  onChangeAmount,
}: {
  listing: AdListing;
  advertisement: ListingAdvertisement;
  field: 'primary' | 'monthlyRent';
  label: string;
  currentText: string;
  requested: { kind: 'draft' | 'pending'; value: number; status?: string } | null;
  requestMode: boolean;
  hasOpenRequest: boolean;
  onChangeAmount?: (
    listing: AdListing,
    advertisement: ListingAdvertisement,
    field: 'primary' | 'monthlyRent',
    value: number | null,
  ) => void;
}) {
  const display = (
    <div className="flex min-w-0 flex-col justify-center py-0.5 tabular-nums">
      <span
        className={cn(
          'block truncate',
          requested &&
            'text-[12px] leading-[15px] text-muted-foreground line-through decoration-muted-foreground/70',
        )}
      >
        {currentText}
      </span>
      {requested && (
        <span
          data-property-ad-requested-value={field}
          data-request-origin={requested.kind}
          title={
            requested.kind === 'pending' && requested.status
              ? `요청 상태: ${REQUEST_STATUS_LABELS[requested.status] ?? requested.status}`
              : '요청 초안'
          }
          className={cn(
            'block truncate text-[12px] font-medium leading-[15px]',
            requested.kind === 'draft' ? 'text-info' : 'text-primary',
          )}
        >
          → {formatRequestPrice(requested.value)}
        </span>
      )}
    </div>
  );

  if (!requestMode) {
    return <div className="flex h-full min-h-9 items-center px-2.5">{display}</div>;
  }

  if (advertisement.status !== 'active' || hasOpenRequest || !onChangeAmount) {
    return (
      <div
        className="flex h-full min-h-9 cursor-not-allowed items-center px-2.5 opacity-60"
        title={
          hasOpenRequest
            ? '처리 중인 요청이 이미 있습니다.'
            : '종료된 광고입니다.'
        }
      >
        {display}
      </div>
    );
  }

  const editorInitial =
    requested?.kind === 'draft'
      ? requested.value
      : currentPropertyAdAmount(listing, advertisement, field);

  return (
    <CellTableNavigationProvider value={null}>
      <EditableCell
        recordId={advertisement.id}
        field={field}
        value={editorInitial}
        onSave={(_recordId, _field, rawValue) => {
          const trimmed = String(rawValue ?? '').trim();
          if (!trimmed) {
            onChangeAmount(listing, advertisement, field, null);
            return;
          }
          const parsed = Number(trimmed);
          if (!Number.isSafeInteger(parsed) || parsed < 0) {
            toast.error('금액은 0 이상의 만원 단위 정수로 입력해 주세요.');
            return false;
          }
          onChangeAmount(listing, advertisement, field, parsed);
        }}
        editType="number"
        numberMinimum={0}
        numberUnit="만원"
        commitOnBlur
        activation="click"
        portalAnchor="self"
        editorChrome="floating"
        portalContainer="body"
        hoverHighlight={false}
        ariaLabel={label}
        className="min-h-9 rounded-none px-2.5 text-[14px] font-[450] leading-[21px] focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        {display}
      </EditableCell>
    </CellTableNavigationProvider>
  );
}

/** 매물관리 · 프로젝트의 펼쳐진 '광고' 탭 표 본문. */
export function PropertyAdPanelContent({
  group,
  controls,
}: {
  group: PropertyListingGroup;
  controls: AdTableControls;
}) {
  const {
    preferences,
    selection,
    mode: explicitMode,
    editMode: legacyEditMode = false,
    requestDrafts = {},
    publishDrafts = [],
    onChangeRequestAmount,
    onToggleRequestFlag,
    onClearRequestFlag,
    onUpdatePublishDraft,
    onRemovePublishDraft,
    onAddManualAd,
    ...headerControls
  } = controls;
  const mode = explicitMode ?? (legacyEditMode ? 'edit' : null);
  const editMode = mode === 'edit';
  const requestMode = mode === 'request';

  const cpAccountsQuery = useQuery({
    queryKey: ['cp-accounts'],
    queryFn: () => api.listingAdvertisements.findCpAccounts(),
    enabled: requestMode && publishDrafts.length > 0,
    staleTime: 60_000,
  });
  const cpAccounts = cpAccountsQuery.data ?? [];

  const adRows = sortPropertyAdRows(
    group.listings.flatMap((listing) =>
      (listing.activeAdvertisements ?? []).map((advertisement) => ({
        listing,
        advertisement,
      })),
    ),
    preferences.sort,
  );
  const allSelected =
    adRows.length > 0 &&
    adRows.every((row) => selection.selectedIds.has(row.advertisement.id));
  const icons: Record<AdColumnId, ReactNode> = {
    trade: <Tag />,
    channel: <Megaphone />,
    status: <Info />,
    price: <WonCircleIcon />,
    monthlyRent: <WonCircleIcon />,
    startedAt: <CalendarDays />,
    memo: <PencilLine />,
    url: <ExternalLink />,
  };

  return (
    <div
      data-property-ad-panel
      data-property-ad-mode={mode ?? 'view'}
      role="region"
      aria-label={`${group.property?.site?.name ?? '매물'} 광고 현황`}
    >
      {requestMode && (
        <p className="mb-1.5 text-[12px] text-info">
          가격을 눌러 바꿀 값을 적거나 상태를 선택하세요. &apos;요청 보내기&apos;를 누르기 전까지 저장되지 않습니다.
        </p>
      )}
      <div role="table" aria-label="광고 현황 표">
        <div className="relative -ml-9 pl-9">
          {adRows.length > 0 && (
            <PropertyPanelSelectionCheckbox
              kind="ad"
              label="표시된 광고 모두 선택"
              checked={
                allSelected
                  ? true
                  : selection.selectedIds.size > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={selection.onSelectAll}
            />
          )}
          <div
            data-property-ad-header
            role="row"
            className="grid h-9 grid-cols-[var(--ad-table-columns)] border-b border-border text-[13px] font-normal leading-[1.6154] text-muted-foreground"
          >
            {adTableColumns.map((column) => (
              <AdTableColumnHeader
                key={column.id}
                column={column}
                icon={icons[column.id]}
                sort={preferences.sort}
                {...headerControls}
              />
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {adRows.length === 0 && publishDrafts.length === 0 ? (
            <div role="row">
              <div
                role="cell"
                aria-colspan={adTableColumns.length}
                className="flex h-[37px] items-center border-b border-border px-2.5 text-[13px] text-muted-foreground"
              >
                등록된 광고가 없습니다.
              </div>
            </div>
          ) : (
            adRows.map(({ listing, advertisement }) => {
              const statusMeta =
                adStatusMeta[advertisement.status] ?? adStatusMeta.active;
              const priceField =
                listing.transactionType === 'sale'
                  ? 'advertisedPrice'
                  : 'advertisedDeposit';
              const advertisedPrice = currentPropertyAdAmount(
                listing,
                advertisement,
                'primary',
              );
              const priceText =
                advertisedPrice != null ? formatPrice(advertisedPrice) : '—';
              const rentText =
                advertisement.advertisedMonthlyRent != null
                  ? formatPrice(advertisement.advertisedMonthlyRent)
                  : '—';
              const channelLabel = getAdChannelLabel(advertisement.channel);
              const typeLabel =
                transactionTypeMeta[listing.transactionType]?.label ??
                listing.transactionType;
              const cellLabel = `${channelLabel} ${typeLabel} 광고`;
              const isSelected = selection.selectedIds.has(advertisement.id);
              const draft = requestDrafts[advertisement.id];
              const hasOpenRequest = Boolean(
                getOpenPropertyAdRequest(advertisement),
              );
              const requestedPrimary = requestedAmountForPropertyAd(
                listing,
                advertisement,
                draft,
                'primary',
              );
              const requestedRent = requestedAmountForPropertyAd(
                listing,
                advertisement,
                draft,
                'monthlyRent',
              );
              const requestedAction = requestedActionForPropertyAd(
                advertisement,
                draft,
              );

              return (
                <div
                  key={advertisement.id}
                  className="group/ad-selection relative -ml-9 pl-9"
                >
                  <PropertyPanelSelectionCheckbox
                    kind="ad"
                    label={`${channelLabel} ${typeLabel} 광고 선택`}
                    checked={isSelected}
                    onCheckedChange={(selected) =>
                      selection.onChange(advertisement.id, selected)
                    }
                  />
                  <div
                    role="row"
                    data-property-ad-row={advertisement.id}
                    data-selected={isSelected || undefined}
                    aria-selected={isSelected}
                    className="grid min-h-[37px] grid-cols-[var(--ad-table-columns)] border-b border-border text-[14px] font-[450] leading-[1.5] text-foreground hover:bg-muted data-[selected=true]:bg-info-soft/40 [&>div]:min-w-0 [&>div]:content-center [&>div]:px-2.5 [&>div:not(:last-child)]:border-r [&>div:not(:last-child)]:border-border"
                  >
                    <div role="cell">
                      <AdTradeBadge transactionType={listing.transactionType} />
                    </div>
                    <div role="cell" title={channelLabel} className="px-0!">
                      <PropertyAdEditableCell
                        advertisement={advertisement}
                        field="channel"
                        label={`${cellLabel} 채널`}
                        disabled={!editMode}
                      >
                        <span className="block truncate">{channelLabel}</span>
                      </PropertyAdEditableCell>
                    </div>
                    <div role="cell" className="px-0!">
                      {editMode ? (
                        <PropertyAdEditableCell
                          advertisement={advertisement}
                          field="status"
                          label={`${cellLabel} 상태`}
                          disabled={false}
                        >
                          <span
                            className={cn(
                              'inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-normal leading-none',
                              statusMeta.className,
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
                            />
                            {statusMeta.label}
                          </span>
                        </PropertyAdEditableCell>
                      ) : (
                        <StatusRequestCell
                          advertisement={advertisement}
                          requestMode={requestMode}
                          requestedAction={requestedAction}
                          hasOpenRequest={hasOpenRequest}
                          onToggleFlag={onToggleRequestFlag}
                          onClearFlag={onClearRequestFlag}
                        >
                          <span
                            className={cn(
                              'inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-normal leading-none',
                              statusMeta.className,
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
                            />
                            {statusMeta.label}
                          </span>
                        </StatusRequestCell>
                      )}
                    </div>
                    <div
                      role="cell"
                      title={priceText}
                      className="px-0! tabular-nums"
                    >
                      {editMode ? (
                        <PropertyAdEditableCell
                          advertisement={advertisement}
                          field={priceField}
                          label={`${cellLabel} ${listing.transactionType === 'sale' ? '가격' : '보증금'}`}
                          disabled={false}
                        >
                          <span className="block truncate">{priceText}</span>
                        </PropertyAdEditableCell>
                      ) : (
                        <RequestMoneyCell
                          listing={listing}
                          advertisement={advertisement}
                          field="primary"
                          label={`${cellLabel} ${listing.transactionType === 'sale' ? '가격' : listing.transactionType === 'jeonse' ? '전세가' : '보증금'} 변경 요청`}
                          currentText={priceText}
                          requested={requestedPrimary}
                          requestMode={requestMode}
                          hasOpenRequest={hasOpenRequest}
                          onChangeAmount={onChangeRequestAmount}
                        />
                      )}
                    </div>
                    <div
                      role="cell"
                      title={rentText}
                      className={cn(
                        'tabular-nums',
                        listing.transactionType === 'monthly' && 'px-0!',
                      )}
                    >
                      {listing.transactionType === 'monthly' ? (
                        editMode ? (
                          <PropertyAdEditableCell
                            advertisement={advertisement}
                            field="advertisedMonthlyRent"
                            label={`${cellLabel} 월세`}
                            disabled={false}
                          >
                            <span className="block truncate">{rentText}</span>
                          </PropertyAdEditableCell>
                        ) : (
                          <RequestMoneyCell
                            listing={listing}
                            advertisement={advertisement}
                            field="monthlyRent"
                            label={`${cellLabel} 월세 변경 요청`}
                            currentText={rentText}
                            requested={requestedRent}
                            requestMode={requestMode}
                            hasOpenRequest={hasOpenRequest}
                            onChangeAmount={onChangeRequestAmount}
                          />
                        )
                      ) : (
                        <span className="block truncate">{rentText}</span>
                      )}
                    </div>
                    <div role="cell" className="px-0! tabular-nums">
                      <PropertyAdEditableCell
                        advertisement={advertisement}
                        field="startedAt"
                        label={`${cellLabel} 등록일`}
                        disabled={!editMode}
                      >
                        {formatDateShort(advertisement.startedAt)}
                      </PropertyAdEditableCell>
                    </div>
                    <div
                      role="cell"
                      title={advertisement.memo?.trim() || undefined}
                      className="px-0!"
                    >
                      <PropertyAdEditableCell
                        advertisement={advertisement}
                        field="memo"
                        label={`${cellLabel} 메모`}
                        disabled={!editMode}
                      >
                        <span className="block truncate">
                          {advertisement.memo?.trim() || '—'}
                        </span>
                      </PropertyAdEditableCell>
                    </div>
                    <div role="cell" className="px-0!">
                      <PropertyAdEditableCell
                        advertisement={advertisement}
                        field="url"
                        label={`${cellLabel} 원문 주소`}
                        disabled={!editMode}
                      >
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {advertisement.url ? '원문 주소' : '—'}
                        </span>
                      </PropertyAdEditableCell>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {requestMode &&
            publishDrafts.map((publishDraft) => {
              const listing =
                group.listings.find(
                  (item) => item.id === publishDraft.listingId,
                ) ?? group.listings[0];
              const channelAccounts = cpAccounts.filter(
                (account) =>
                  account.channel === publishDraft.channel &&
                  account.isActive !== false,
              );
              const tradeType = listing?.transactionType ?? 'sale';
              return (
                <div
                  key={publishDraft.tempId}
                  role="row"
                  data-property-ad-publish-row={publishDraft.tempId}
                  className="grid min-h-[37px] grid-cols-[var(--ad-table-columns)] border-b border-border bg-info-soft/25 text-[14px] font-[450] leading-[1.5] text-foreground [&>div]:min-w-0 [&>div]:content-center [&>div]:px-2 [&>div:not(:last-child)]:border-r [&>div:not(:last-child)]:border-border"
                >
                  <div role="cell" className="py-1">
                    {group.listings.length > 1 ? (
                      <select
                        aria-label="신규 게재 거래 유형"
                        value={listing?.id ?? ''}
                        onChange={(event) => {
                          const nextListing = group.listings.find(
                            (item) => item.id === event.target.value,
                          );
                          if (!nextListing) return;
                          const defaults = defaultPublishAmounts(nextListing);
                          onUpdatePublishDraft?.(publishDraft.tempId, {
                            listingId: nextListing.id,
                            primary: defaults.primary,
                            monthlyRent: defaults.monthlyRent,
                          });
                        }}
                        className="h-7 w-full rounded border border-input bg-background px-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {group.listings.map((item) => (
                          <option key={item.id} value={item.id}>
                            {transactionTypeMeta[item.transactionType]?.label ??
                              item.transactionType}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <AdTradeBadge transactionType={tradeType} />
                    )}
                  </div>
                  <div role="cell" className="space-y-1 py-1">
                    <select
                      aria-label="신규 게재 광고 채널"
                      value={publishDraft.channel}
                      onChange={(event) =>
                        onUpdatePublishDraft?.(publishDraft.tempId, {
                          channel: event.target.value,
                          cpAccountId: null,
                        })
                      }
                      className="h-7 w-full rounded border border-input bg-background px-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {!isNaverCpChannel(publishDraft.channel) && (
                        <option value={publishDraft.channel}>
                          {getAdChannelLabel(publishDraft.channel)}
                        </option>
                      )}
                      {naverCpChannels.map((channel) => (
                        <option key={channel.value} value={channel.value}>
                          {channel.label}
                        </option>
                      ))}
                    </select>
                    {channelAccounts.length > 0 && (
                      <select
                        aria-label="신규 게재 CP 계정"
                        value={publishDraft.cpAccountId ?? ''}
                        onChange={(event) =>
                          onUpdatePublishDraft?.(publishDraft.tempId, {
                            cpAccountId: event.target.value || null,
                          })
                        }
                        className="h-6 w-full rounded border border-input bg-background px-1 text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">계정 지정 안 함</option>
                        {channelAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.accountName
                              ? `${account.accountName} (${account.accountKey})`
                              : account.accountKey}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div role="cell" className="py-1">
                    <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-info-soft px-2 text-[12px] font-normal text-info">
                      신규 요청
                    </span>
                  </div>
                  <div role="cell" className="py-1 tabular-nums">
                    <Input
                      type="text"
                      inputMode="numeric"
                      aria-label={
                        tradeType === 'sale'
                          ? '신규 게재 매매가 (만원)'
                          : tradeType === 'jeonse'
                            ? '신규 게재 전세가 (만원)'
                            : '신규 게재 보증금 (만원)'
                      }
                      placeholder="만원"
                      value={publishDraft.primary ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw) {
                          onUpdatePublishDraft?.(publishDraft.tempId, {
                            primary: null,
                          });
                          return;
                        }
                        if (!/^\d+$/.test(raw)) return;
                        onUpdatePublishDraft?.(publishDraft.tempId, {
                          primary: Number(raw),
                        });
                      }}
                      className="h-7 px-2 text-[13px] tabular-nums"
                    />
                    {publishDraft.primary != null && (
                      <span className="mt-0.5 block truncate px-0.5 text-[11px] text-info">
                        {formatRequestPrice(publishDraft.primary)}
                      </span>
                    )}
                  </div>
                  <div role="cell" className="py-1 tabular-nums">
                    {tradeType === 'monthly' ? (
                      <>
                        <Input
                          type="text"
                          inputMode="numeric"
                          aria-label="신규 게재 월세 (만원)"
                          placeholder="만원"
                          value={publishDraft.monthlyRent ?? ''}
                          onChange={(event) => {
                            const raw = event.target.value.trim();
                            if (!raw) {
                              onUpdatePublishDraft?.(publishDraft.tempId, {
                                monthlyRent: null,
                              });
                              return;
                            }
                            if (!/^\d+$/.test(raw)) return;
                            onUpdatePublishDraft?.(publishDraft.tempId, {
                              monthlyRent: Number(raw),
                            });
                          }}
                          className="h-7 px-2 text-[13px] tabular-nums"
                        />
                        {publishDraft.monthlyRent != null && (
                          <span className="mt-0.5 block truncate px-0.5 text-[11px] text-info">
                            {formatRequestPrice(publishDraft.monthlyRent)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div role="cell" className="text-[12px] text-muted-foreground">
                    —
                  </div>
                  <div role="cell" className="text-[12px] text-muted-foreground">
                    —
                  </div>
                  <div role="cell" className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="신규 게재 요청 삭제"
                      onClick={() =>
                        onRemovePublishDraft?.(publishDraft.tempId)
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
        {onAddManualAd && (
          <button
            type="button"
            onClick={onAddManualAd}
            aria-disabled={!editMode && !requestMode}
            title={
              requestMode
                ? '새 광고를 올려 달라는 신규 게재 요청 줄을 추가합니다'
                : editMode
                  ? '새 광고 기록을 직접 추가합니다'
                  : "수동 추가·수정은 '기록 수정·추가' 모드를 켜 주세요. 에이전트 실행은 '광고 요청'을 이용해 주세요."
            }
            className={cn(
              'flex h-9 w-full items-center gap-1.5 rounded pl-2.5 text-left text-[13px] transition-colors',
              requestMode
                ? 'text-info hover:bg-info-soft/40'
                : editMode
                  ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  : 'text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground',
            )}
          >
            <Plus className="size-3" />
            {requestMode ? '신규 게재 요청' : '광고 기록 추가'}
          </button>
        )}
      </div>
    </div>
  );
}
