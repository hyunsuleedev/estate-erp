import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactCategoryKey } from '@estate-erp/shared';
import {
  AlarmClock,
  BookUser,
  BriefcaseBusiness,
  Building2,
  CircleSlash,
  EllipsisVertical,
  Handshake,
  History,
  Home,
  KeyRound,
  MessageSquare,
  MessageSquareOff,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PhoneOff,
  Plus,
  Tag,
  Target,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { isContactTagVisible } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import {
  ALL_CONTACTS_CATEGORY,
  CONTACT_CATEGORY_SECTIONS,
  contactGroupCategory,
  contactGroupNameOf,
  type ContactCategory,
} from './-contact-categories';
import { ContactGroupNameDialog } from './-contact-group-dialog';

const PANEL_ID = 'contact-categories-panel';
const PANEL_OPEN_KEY = 'contacts.categoriesPanelOpen';

const CATEGORY_ICONS: Record<ContactCategoryKey, LucideIcon> = {
  buyer_sale: Target,
  buyer_rent: KeyRound,
  owner: Building2,
  tenant: Home,
  representative: BriefcaseBusiness,
  in_deal: Handshake,
  follow_up: AlarmClock,
  recent_consult: MessageSquare,
  stale_consult: History,
  no_consult: MessageSquareOff,
  uncategorized: CircleSlash,
  no_phone: PhoneOff,
};

/** 사이드바와 일괄 작업이 같은 조회를 쓴다. 연락처가 바뀌면 ['contacts'] 무효화로 함께 갱신된다. */
export const contactCategorySummaryQuery = {
  queryKey: ['contacts', 'category-summary'],
  queryFn: () => api.contacts.getCategorySummary(),
  staleTime: 30_000,
};

/** 분류를 고르는 화면이라 처음에는 열어 둔다. 사용자가 닫으면 그 상태를 기억한다. */
export function readStoredCategoriesPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function storeCategoriesPanelOpen(open: boolean) {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, String(open));
  } catch {
    /* 저장 못 해도 이번 세션 동작에는 영향 없음 */
  }
}

/** 본문 첫 줄의 분류 버튼 — 관리단지의 단지 버튼과 같은 모양 */
export function ContactCategoriesToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      aria-controls={PANEL_ID}
      aria-expanded={open}
      title={`연락처 분류 ${open ? '닫기' : '열기'}`}
      onClick={onToggle}
      className={cn(
        'flex h-[30px] max-w-[180px] shrink-0 items-center gap-2 rounded-full bg-[#f1f0ec] pl-1 pr-3 outline-none transition-colors hover:bg-[#e9e8e3] focus-visible:ring-2 focus-visible:ring-foreground/20',
        open && 'bg-white ring-1 ring-[#d6d5d0] hover:bg-white',
      )}
    >
      <span
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-full text-muted-foreground',
          open ? 'bg-[#f1f0ec]' : 'bg-white',
        )}
      >
        <Icon className="size-[13px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold">{label}</span>
    </button>
  );
}

export function ContactCategoriesPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (categoryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const summary = useQuery(contactCategorySummaryQuery);
  const [isCreating, setIsCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const invalidateContacts = () =>
    queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const deleteGroup = useMutation({
    mutationFn: (name: string) => api.contacts.deleteGroup(name),
    onSuccess: async (_result, name) => {
      if (contactGroupNameOf(selectedId) === name) {
        onSelect(ALL_CONTACTS_CATEGORY.id);
      }
      setDeleteTarget(null);
      await invalidateContacts();
      toast.success(`'${name}' 그룹을 삭제했습니다.`);
    },
    onError: () => toast.error('그룹을 삭제하지 못했습니다.'),
  });

  // 건수를 못 불러왔거나 방금 비워졌어도 고른 그룹이 목록에서 사라지지 않게 한다.
  const selectedGroupName = contactGroupNameOf(selectedId);
  const loadedGroups = (summary.data?.groups ?? []).filter(({ name }) =>
    isContactTagVisible(name),
  );
  const groups =
    selectedGroupName && !loadedGroups.some(({ name }) => name === selectedGroupName)
      ? [...loadedGroups, { name: selectedGroupName, count: undefined }]
      : loadedGroups;

  return (
    <aside
      id={PANEL_ID}
      aria-label="연락처 분류"
      className="flex w-[240px] shrink-0 flex-col border-r border-border bg-[#f9f9f8]"
    >
      {/* 본문 첫 도구줄과 높이를 맞춰 가로선이 이어진다 */}
      <div className="flex h-[51px] shrink-0 items-center border-b border-border px-4 text-[13px] font-semibold">
        연락처 분류
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <CategoryRow
          category={ALL_CONTACTS_CATEGORY}
          icon={BookUser}
          count={summary.data?.total}
          selected={selectedId === ALL_CONTACTS_CATEGORY.id}
          onSelect={onSelect}
        />

        {CONTACT_CATEGORY_SECTIONS.map((section) => (
          <div key={section.label}>
            <SectionLabel label={section.label} />
            {section.categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                icon={CATEGORY_ICONS[category.id as ContactCategoryKey]}
                count={summary.data?.counts[category.id as ContactCategoryKey]}
                selected={selectedId === category.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}

        <SectionLabel label="그룹">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="새 그룹 만들기"
            title="새 그룹 만들기"
            className="ml-auto size-5 text-muted-foreground"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        </SectionLabel>
        {groups.map((group) => (
          <GroupRow
            key={group.name}
            category={contactGroupCategory(group.name)}
            count={group.count}
            selected={selectedGroupName === group.name}
            onSelect={onSelect}
            onRename={() => setRenameTarget(group.name)}
            onDelete={() => setDeleteTarget(group.name)}
          />
        ))}
        {summary.isSuccess && groups.length === 0 && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            첫 그룹 만들기
          </button>
        )}

        {summary.isError && (
          <div role="alert" className="mt-3 px-2 text-xs leading-5 text-muted-foreground">
            건수와 그룹을 불러오지 못했습니다.{' '}
            <button
              type="button"
              className="rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => void summary.refetch()}
            >
              다시 시도
            </button>
          </div>
        )}
      </nav>

      <ContactGroupNameDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        title="새 그룹 만들기"
        description="사무소 직원 모두가 함께 쓰는 그룹입니다. 만든 뒤 연락처를 선택해 넣을 수 있습니다."
        submitLabel="만들기"
        onSubmit={async (typedName) => {
          // 서버가 공백을 다듬으므로 입력값이 아니라 저장된 이름으로 고른다.
          const { name } = await api.contacts.createGroup(typedName);
          await invalidateContacts();
          onSelect(contactGroupCategory(name).id);
        }}
      />
      <ContactGroupNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title="그룹 이름 바꾸기"
        description="이 그룹에 속한 연락처의 표시도 함께 바뀝니다."
        initialName={renameTarget ?? ''}
        submitLabel="저장"
        onSubmit={async (newName) => {
          if (renameTarget === null) return;
          const { name } = await api.contacts.renameGroup(renameTarget, newName);
          if (selectedGroupName === renameTarget) {
            onSelect(contactGroupCategory(name).id);
          }
          await invalidateContacts();
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`'${deleteTarget ?? ''}' 그룹을 삭제할까요?`}
        description="연락처는 지워지지 않고 그룹에서만 빠집니다. 삭제한 그룹은 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={deleteGroup.isPending}
        onConfirm={() => {
          if (deleteTarget !== null) deleteGroup.mutate(deleteTarget);
        }}
      />
    </aside>
  );
}

function SectionLabel({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-3 flex h-7 items-center px-2 text-xs text-muted-foreground">
      {label}
      {children}
    </div>
  );
}

const ROW_CLASS_NAME =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:ring-2 focus-visible:ring-ring/60';
const ROW_SELECTED_CLASS_NAME =
  'bg-[rgba(55,53,47,0.08)] hover:bg-[rgba(55,53,47,0.08)]';

function CategoryRow({
  category,
  icon: Icon,
  count,
  selected,
  onSelect,
  countClassName,
}: {
  category: ContactCategory;
  icon: LucideIcon;
  count: number | undefined;
  selected: boolean;
  onSelect: (categoryId: string) => void;
  countClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(category.id)}
      className={cn(ROW_CLASS_NAME, selected && ROW_SELECTED_CLASS_NAME)}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          selected ? 'text-foreground/80' : 'text-muted-foreground/70',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px]',
          selected && 'font-semibold',
        )}
      >
        {category.label}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            'shrink-0 text-[11.5px] tabular-nums',
            count === 0 ? 'text-muted-foreground/50' : 'text-muted-foreground',
            countClassName,
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

/** 직접 관리하는 그룹 줄 — 올리면 건수 자리에 메뉴가 나타난다 */
function GroupRow({
  category,
  count,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  category: ContactCategory;
  count: number | undefined;
  selected: boolean;
  onSelect: (categoryId: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/row relative">
      <CategoryRow
        category={category}
        icon={Tag}
        count={count}
        selected={selected}
        onSelect={onSelect}
        countClassName="group-hover/row:opacity-0 group-focus-within/row:opacity-0"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${category.label} 그룹 메뉴`}
            className="absolute right-1 top-1 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100"
          >
            <EllipsisVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="size-3.5" />
            이름 바꾸기
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
