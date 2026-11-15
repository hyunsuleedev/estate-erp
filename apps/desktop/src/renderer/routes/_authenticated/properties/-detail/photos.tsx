import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Star, Trash2, X } from 'lucide-react';
import type { PropertyPhoto } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatFullDate } from './model';
import {
  getPhotoCaption,
  getPhotoCategoryLabel,
  photoCategoryLabels,
  photoCategoryOrder,
} from './brief-model';
import { H2, nb } from './ui';

/*
 * 매물 사진. 서버 순서의 첫 장이 대표 사진이다(사진 자료실과 같은 규칙).
 * 사진 올리기는 저장소 연동 후 제공한다 — 지금은 보기·분류·대표 지정·삭제만 한다.
 */

const VISIBLE = 5;

export function PhotosSection({
  photos,
  status,
  guest,
  pendingId,
  onRetry,
  onSetCover,
  onChangeCategory,
  onDelete,
}: {
  /** sortPhotos로 정렬된 사진 (첫 장 = 대표) */
  photos: PropertyPhoto[];
  status: 'loading' | 'error' | 'ready';
  guest: boolean;
  pendingId: string | null;
  onRetry: () => void;
  onSetCover: (photo: PropertyPhoto) => void;
  onChangeCategory: (photo: PropertyPhoto, category: string) => void;
  onDelete: (photo: PropertyPhoto) => Promise<void>;
}) {
  const [category, setCategory] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const coverId = photos[0]?.id ?? null;

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const photo of photos) result.set(photo.category, (result.get(photo.category) ?? 0) + 1);
    return result;
  }, [photos]);
  const categories = photoCategoryOrder.filter((key) => counts.get(key));
  // 지금 고른 분류의 사진이 모두 사라지면 전체로 돌아간다.
  const activeCategory = category !== 'all' && !counts.get(category) ? 'all' : category;
  const list = activeCategory === 'all' ? photos : photos.filter((photo) => photo.category === activeCategory);
  const visible = list.slice(0, VISIBLE);
  const n = visible.length;

  if (guest && photos.length === 0) return null;

  return (
    <section id="photos" aria-label="매물 사진" className={cn(guest && 'order-first')}>
      <H2 title="사진" count={photos.length} hint={guest ? null : '손님에게 보여주고 보낼 때'} />
      {status === 'loading' ? (
        <div className="mt-2.5 h-[262px] animate-pulse rounded-lg bg-[#f1f0ec]" />
      ) : status === 'error' ? (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#fbfbfa] px-4 py-3 text-[13px] text-[#37352f]/65 shadow-[0_0_0_1px_#e9e9e7]">
          사진을 불러오지 못했습니다.
          <button type="button" className={nb.line} onClick={onRetry}>
            다시 시도
          </button>
        </div>
      ) : photos.length === 0 ? (
        <div className="mt-2.5 rounded-lg border-[1.5px] border-dashed border-[#37352f]/[0.18] bg-[#fbfbfa] px-4 py-6 text-center text-[13px] text-[#37352f]/65">
          등록된 사진이 없습니다. 사진 올리기는 저장소 연동 후 제공됩니다.
        </div>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {['all', ...categories].map((key) => {
                const on = activeCategory === key;
                return (
                  <button
                    key={key}
                    type="button"
                    data-photo-cat={key}
                    onClick={() => setCategory(key)}
                    className={cn(
                      'inline-flex h-[26px] items-center gap-1 rounded-full px-[9px] text-[13px] transition-colors',
                      on
                        ? 'bg-[#37352f] text-white'
                        : 'text-[#37352f]/65 shadow-[inset_0_0_0_1px_rgba(55,53,47,0.14)] hover:bg-[#37352f]/[0.06] hover:text-[#37352f]',
                    )}
                  >
                    {key === 'all' ? '전체' : getPhotoCategoryLabel(key)}
                    <span className="tabular-nums opacity-60">{key === 'all' ? photos.length : counts.get(key)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div
            data-photo-gallery={n}
            className={cn(
              'mt-2.5 grid gap-1.5 overflow-hidden rounded-lg',
              n === 1 && 'grid-cols-1',
              n === 2 && 'grid-cols-2',
              n === 3 && 'grid-cols-[2fr_1fr]',
              n >= 4 && 'grid-cols-[2fr_1fr_1fr]',
              n <= 2
                ? guest
                  ? 'grid-rows-[386px]'
                  : 'grid-rows-[262px]'
                : guest
                  ? 'grid-rows-[190px_190px]'
                  : 'grid-rows-[128px_128px]',
            )}
          >
            {visible.map((photo, index) => {
              const more = index === VISIBLE - 1 && list.length > VISIBLE ? list.length - VISIBLE : 0;
              return (
                <button
                  key={photo.id}
                  type="button"
                  data-photo={photo.id}
                  onClick={() => setOpenId(photo.id)}
                  aria-label={`${getPhotoCategoryLabel(photo.category)} 사진 크게 보기`}
                  className={cn(
                    'group relative min-w-0 cursor-zoom-in overflow-hidden bg-[#f1f0ec]',
                    index === 0 && n >= 3 && 'row-span-2',
                    n === 4 && index === 3 && 'col-span-2',
                  )}
                >
                  <img
                    src={photo.fileUrl}
                    alt={getPhotoCaption(photo, guest)}
                    loading="lazy"
                    className={cn(
                      'block size-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.025]',
                      photo.category === 'floorplan' ? 'bg-white object-contain p-1.5' : 'object-cover',
                    )}
                  />
                  {more > 0 ? (
                    <span className="absolute inset-0 grid place-items-center bg-[rgba(15,15,15,0.48)] text-[15px] font-semibold text-white">
                      +{more} 모두 보기
                    </span>
                  ) : (
                    <span className="absolute bottom-2 left-2 inline-flex h-[22px] items-center gap-[5px] rounded bg-[rgba(15,15,15,0.55)] px-[7px] text-[12px] text-white backdrop-blur-sm">
                      {photo.id === coverId && <span className="text-[rgb(255,214,102)]">★</span>}
                      {getPhotoCategoryLabel(photo.category)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {openId && (
        <Lightbox
          list={list}
          startId={openId}
          coverId={coverId}
          guest={guest}
          pendingId={pendingId}
          onClose={() => setOpenId(null)}
          onSetCover={onSetCover}
          onChangeCategory={onChangeCategory}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

function Lightbox({
  list,
  startId,
  coverId,
  guest,
  pendingId,
  onClose,
  onSetCover,
  onChangeCategory,
  onDelete,
}: {
  list: PropertyPhoto[];
  startId: string;
  coverId: string | null;
  guest: boolean;
  pendingId: string | null;
  onClose: () => void;
  onSetCover: (photo: PropertyPhoto) => void;
  onChangeCategory: (photo: PropertyPhoto, category: string) => void;
  onDelete: (photo: PropertyPhoto) => Promise<void>;
}) {
  // 보고 있는 사진을 id로 기억한다: 분류를 바꾸거나 다른 사진이 지워져도 같은 사진에 머문다.
  const [currentId, setCurrentId] = useState(startId);
  const [catOpen, setCatOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastIndexRef = useRef(0);

  const foundIndex = list.findIndex((photo) => photo.id === currentId);
  const index = foundIndex >= 0 ? foundIndex : Math.min(lastIndexRef.current, list.length - 1);
  if (foundIndex >= 0) lastIndexRef.current = foundIndex;
  const photo = index >= 0 ? list[index] : undefined;

  useEffect(() => {
    if (!photo) onClose();
    else if (photo.id !== currentId) setCurrentId(photo.id);
  }, [photo, currentId, onClose]);

  const go = useCallback(
    (step: number) => {
      if (list.length < 2) return;
      const next = list[(index + step + list.length) % list.length];
      setCurrentId(next.id);
      setCatOpen(false);
      setConfirmDelete(false);
    },
    [index, list],
  );

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (catOpen) setCatOpen(false);
        else if (confirmDelete) setConfirmDelete(false);
        else onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      }
    };
    // 캡처 단계에서 먼저 받는다: 손님 보기의 Esc(보여주기 끄기)보다 사진 닫기가 먼저다.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [catOpen, confirmDelete, go, onClose]);

  if (!photo) return null;
  const isCover = photo.id === coverId;
  const busy = pendingId === photo.id || deleting;
  const caption = getPhotoCaption(photo, guest);

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      data-photo-lightbox
      className="fixed inset-0 z-[150] flex flex-col bg-[rgba(15,15,15,0.94)] text-white outline-none animate-in fade-in duration-150"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 pl-5 pr-3.5 text-[14px]">
        <span className="tabular-nums text-white/70">
          {index + 1} / {list.length}
        </span>
        <div className="relative">
          {guest ? (
            <span className="inline-flex h-6 items-center rounded bg-white/[0.14] px-2 text-[13px]">
              {getPhotoCategoryLabel(photo.category)}
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setCatOpen((value) => !value)}
              aria-expanded={catOpen}
              className="inline-flex h-6 items-center gap-1 rounded bg-white/[0.14] px-2 text-[13px] hover:bg-white/[0.22]"
            >
              {getPhotoCategoryLabel(photo.category)}
              <ChevronDown className="size-3.5" />
            </button>
          )}
          {catOpen && (
            <div
              role="menu"
              className="absolute left-0 top-8 z-10 grid w-[180px] grid-cols-2 gap-0.5 rounded-md bg-white p-1 text-[13px] text-[#37352f] shadow-[0_0_0_1px_rgba(15,15,15,0.05),0_3px_6px_rgba(15,15,15,0.1),0_9px_24px_rgba(15,15,15,0.2)]"
            >
              {Object.entries(photoCategoryLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={photo.category === key}
                  onClick={() => {
                    setCatOpen(false);
                    if (photo.category !== key) onChangeCategory(photo, key);
                  }}
                  className={cn(
                    'h-7 rounded px-2 text-left hover:bg-[#37352f]/[0.06]',
                    photo.category === key && 'bg-[#37352f]/[0.08] font-medium',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {isCover && <span className="text-[13px] text-[rgb(255,214,102)]">★ 대표 사진</span>}
        <span className="flex-1" />
        {!guest &&
          (confirmDelete ? (
            <>
              <span className="text-[13px] text-white/80">이 사진을 지울까요? 되돌릴 수 없습니다.</span>
              <button
                type="button"
                disabled={busy}
                className={cn(nb.ghost, 'bg-[rgb(212,76,71)] text-white hover:bg-[rgb(190,60,56)] hover:text-white')}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(photo);
                    setConfirmDelete(false);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                <Trash2 />
                삭제
              </button>
              <button type="button" className={lightNb} onClick={() => setConfirmDelete(false)}>
                취소
              </button>
            </>
          ) : (
            <>
              {!isCover && (
                <button type="button" disabled={busy} className={lightNb} onClick={() => onSetCover(photo)}>
                  <Star />
                  대표 사진으로
                </button>
              )}
              <a href={photo.fileUrl} download={photo.fileName} target="_blank" rel="noreferrer" className={lightNb}>
                <Download />
                내려받기
              </a>
              <button type="button" disabled={busy} className={lightNb} onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                삭제
              </button>
            </>
          ))}
        <button type="button" className={lightNb} onClick={onClose} aria-label="닫기">
          <X />
          <kbd className="font-sans text-[11px] text-white/50">Esc</kbd>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-[72px]">
        <img
          src={photo.fileUrl}
          alt={caption}
          className={cn(
            'max-h-[calc(100vh-210px)] max-w-[calc(100vw-160px)] rounded object-contain shadow-[0_10px_40px_rgba(0,0,0,0.4)]',
            photo.category === 'floorplan' && 'bg-white p-4',
          )}
        />
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="이전 사진" className={cn(navButton, 'left-4')}>
              <ChevronLeft className="size-[22px]" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="다음 사진" className={cn(navButton, 'right-4')}>
              <ChevronRight className="size-[22px]" />
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 px-5 pb-1 pt-2.5 text-center text-[14px] text-white/90">
        {caption}
        {!guest && (
          <small className="mt-0.5 block text-[12.5px] text-white/55">{formatFullDate(photo.createdAt)} 등록</small>
        )}
      </div>
      {list.length > 1 && (
        <div className="flex shrink-0 justify-center gap-1.5 overflow-x-auto px-5 pb-4 pt-2.5">
          {list.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentId(item.id)}
              aria-label={`${getPhotoCategoryLabel(item.category)} 사진`}
              className={cn(
                'h-12 w-[72px] shrink-0 overflow-hidden rounded bg-[#333] opacity-50 transition-opacity hover:opacity-80',
                itemIndex === index && 'opacity-100 shadow-[0_0_0_2px_#fff]',
              )}
            >
              <img
                src={item.fileUrl}
                alt=""
                className={cn('block size-full', item.category === 'floorplan' ? 'bg-white object-contain' : 'object-cover')}
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

const lightNb =
  'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2 text-[14px] text-white/85 transition-colors hover:bg-white/[0.12] hover:text-white disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]';
const navButton =
  'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/[0.12] text-white transition-colors hover:bg-white/[0.22]';
