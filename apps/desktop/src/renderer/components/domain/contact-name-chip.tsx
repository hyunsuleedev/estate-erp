import { Link } from '@tanstack/react-router';
import { User } from 'lucide-react';

/**
 * 표 칸의 사람 이름 — 이름 첫 글자를 넣은 동그라미와 이름. 누르면 그 연락처를 연다.
 *
 * 매물관리 매칭 표의 손님 칸과 같은 모양이다. 그 화면은 아직 같은 마크업을 따로 갖고
 * 있다. 고칠 때는 이 부품으로 모은다.
 *
 * 글자 크기와 색은 놓인 칸의 것을 따른다.
 */
export interface ContactNameChipProps {
  contactId: string;
  name: string;
}

/** 이름 첫 글자 동그라미 + 이름. 누르는 배지와 누르지 않는 배지가 같은 모양을 쓴다. */
function NameBadgeContent({ name }: { name: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 select-none items-center justify-center rounded-full bg-info-soft text-[11px] font-medium leading-none text-info-strong"
      >
        {name.trim().slice(0, 1) || <User className="size-3" />}
      </span>
      <span className="truncate">{name}</span>
    </>
  );
}

const nameBadgeClassName =
  'inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-transparent py-0.5 pl-0.5 pr-2 font-[450]';

export function ContactNameChip({ contactId, name }: ContactNameChipProps) {
  return (
    <Link
      data-contact-name-chip
      to="/contacts/$id"
      params={{ id: contactId }}
      className={`${nameBadgeClassName} transition-colors duration-150 hover:bg-info-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none`}
      title={`${name} 연락처 열기`}
      onClick={(event) => event.stopPropagation()}
      // 표가 Enter를 "행 열기"로 가로채지 않게 한다. 링크에 포커스가 있을 때의 Enter는
      // 연락처를 여는 것이다. 방향키 등 다른 키는 표의 이동 동작으로 그대로 넘긴다.
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.stopPropagation();
      }}
    >
      <NameBadgeContent name={name} />
    </Link>
  );
}

/**
 * 누르지 않는 이름 배지 — 모양은 ContactNameChip과 같고 링크도 올림 효과도 없다.
 * 줄 자체가 그 사람인 표(연락처 목록)에서 쓴다. 거기서는 이름을 눌러 갈 곳이 따로 없고,
 * 여는 것은 줄의 "열기" 버튼이 맡는다.
 */
export function ContactNameBadge({ name }: { name: string }) {
  return (
    <span data-contact-name-badge className={nameBadgeClassName}>
      <NameBadgeContent name={name} />
    </span>
  );
}
