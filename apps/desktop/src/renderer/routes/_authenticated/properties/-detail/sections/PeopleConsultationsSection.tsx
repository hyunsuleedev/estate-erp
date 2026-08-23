import { useMemo } from 'react';
import type {
  Consultation,
  Match,
  PropertyContact,
  Tenant,
} from '@estate-erp/api-client';
import { MessageSquare, Phone, Plus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  consultationTypeLabels,
  formatDateTime,
  formatRelativeDate,
  matchStageLabels,
  roleLabels,
} from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

interface Props {
  propertyContacts: PropertyContact[];
  tenants: Tenant[];
  matches: Match[];
  consultations: Consultation[];
  onAddConsultationFor: (contactId: string) => void;
  onAddPropertyContact: () => void;
  onAddTenant: () => void;
}

interface PersonGroup {
  contactId: string;
  name: string;
  phone: string | null;
  role: string;
  /** 카테고리 — 정렬 우선순위용 */
  category: 'owner' | 'tenant' | 'buyer' | 'related';
  /** 부가 정보 (지분, 매칭 단계 등) */
  extra: string | null;
  isPrimary: boolean;
}

const categoryOrder: Record<PersonGroup['category'], number> = {
  owner: 0,
  tenant: 1,
  buyer: 2,
  related: 3,
};

const categoryColors: Record<PersonGroup['category'], string> = {
  owner: 'bg-amber-50 text-amber-800 border-amber-200',
  tenant: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  buyer: 'bg-blue-50 text-blue-800 border-blue-200',
  related: 'bg-slate-50 text-slate-700 border-slate-200',
};

const categoryLabels: Record<PersonGroup['category'], string> = {
  owner: '소유',
  tenant: '임차',
  buyer: '매수',
  related: '관련',
};

export function PeopleConsultationsSection({
  propertyContacts,
  tenants,
  matches,
  consultations,
  onAddConsultationFor,
  onAddPropertyContact,
  onAddTenant,
}: Props) {
  const people = useMemo<PersonGroup[]>(() => {
    const seen = new Set<string>();
    const list: PersonGroup[] = [];

    // 1) 매물 관련인 (소유자/공동소유/대리인 등)
    for (const pc of propertyContacts) {
      if (!pc.contact?.id || seen.has(pc.contact.id)) continue;
      seen.add(pc.contact.id);
      const isOwner = pc.role === 'owner' || pc.role === 'co_owner';
      list.push({
        contactId: pc.contact.id,
        name: pc.contact.name ?? '이름 없음',
        phone: pc.contact.phone ?? null,
        role: roleLabels[pc.role] ?? pc.role ?? '관련인',
        category: isOwner ? 'owner' : 'related',
        extra: pc.shareRatio != null ? `지분 ${pc.shareRatio}%` : null,
        isPrimary: pc.isPrimary,
      });
    }

    // 2) 세입자
    for (const t of tenants.filter((x) => x.status !== 'moved')) {
      if (!t.contact?.id || seen.has(t.contact.id)) continue;
      seen.add(t.contact.id);
      list.push({
        contactId: t.contact.id,
        name: t.contact.name ?? '이름 없음',
        phone: t.contact.phone ?? null,
        role: '세입자',
        category: 'tenant',
        extra:
          t.contractEnd != null
            ? `만기 ${formatRelativeDate(t.contractEnd)}`
            : null,
        isPrimary: false,
      });
    }

    // 3) 매수 고객 (매칭으로 연결된 사람들 — closed 제외)
    for (const m of matches.filter((x) => x.stage !== 'closed')) {
      const buyer = m.buyerRequirement?.contact;
      if (!buyer?.id || seen.has(buyer.id)) continue;
      seen.add(buyer.id);
      list.push({
        contactId: buyer.id,
        name: buyer.name ?? '이름 없음',
        phone: buyer.phone ?? null,
        role: '매수 고객',
        category: 'buyer',
        extra: matchStageLabels[m.stage] ?? m.stage,
        isPrimary: false,
      });
    }

    // 4) 상담만 있는데 위 3개 카테고리에 없는 사람 (drop-in)
    for (const c of consultations) {
      if (!c.contact?.id || seen.has(c.contact.id)) continue;
      seen.add(c.contact.id);
      list.push({
        contactId: c.contact.id,
        name: c.contact.name ?? '이름 없음',
        phone: c.contact.phone ?? null,
        role: '연락처',
        category: 'related',
        extra: null,
        isPrimary: false,
      });
    }

    return list.sort(
      (a, b) =>
        categoryOrder[a.category] - categoryOrder[b.category] ||
        Number(b.isPrimary) - Number(a.isPrimary),
    );
  }, [propertyContacts, tenants, matches, consultations]);

  // contactId별 상담 그룹핑
  const consultationsByContact = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of consultations) {
      if (!c.contactId) continue;
      const arr = map.get(c.contactId) ?? [];
      arr.push(c);
      map.set(c.contactId, arr);
    }
    // 시간 역순 정렬
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return map;
  }, [consultations]);

  return (
    <MainSection
      title="인물 · 상담"
      count={people.length}
      action={
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={onAddPropertyContact}
          >
            관련인 추가
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={onAddTenant}
          >
            임차인 추가
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => onAddConsultationFor('')}
          >
            <Plus className="size-3" />
            상담 추가
          </Button>
        </div>
      }
    >
      {people.length === 0 ? (
        <MainSectionEmpty
          text="등록된 소유자, 임차인, 매수 고객이 없습니다. 우선 상담 기록을 남기거나 매물 등록 화면에서 관련인을 추가하세요."
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => onAddConsultationFor('')}
            >
              <Plus className="size-3" />
              상담부터 추가
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <PersonCard
              key={person.contactId}
              person={person}
              consultations={consultationsByContact.get(person.contactId) ?? []}
              onAdd={() => onAddConsultationFor(person.contactId)}
            />
          ))}
        </div>
      )}
    </MainSection>
  );
}

function PersonCard({
  person,
  consultations,
  onAdd,
}: {
  person: PersonGroup;
  consultations: Consultation[];
  onAdd: () => void;
}) {
  const recent = consultations.slice(0, 3);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-white">
      {/* 헤더: 누구인지 */}
      <div className="flex items-start gap-2.5 border-b border-border/60 px-3 py-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[14px] font-semibold text-muted-foreground">
          {person.name.charAt(0) || <User className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                categoryColors[person.category],
              )}
            >
              {categoryLabels[person.category]}
            </span>
            <span className="truncate text-[14px] font-semibold text-foreground">
              {person.name}
            </span>
            {person.isPrimary && (
              <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">
                대표
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[11px] text-muted-foreground">
            <span>{person.role}</span>
            {person.extra && (
              <>
                <span>·</span>
                <span>{person.extra}</span>
              </>
            )}
            {person.phone && (
              <>
                <span>·</span>
                <span className="font-mono">{person.phone}</span>
              </>
            )}
          </div>
        </div>
        {person.phone && (
          <a
            href={`tel:${person.phone}`}
            className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${person.name}에게 전화`}
          >
            <Phone className="size-3.5" />
          </a>
        )}
      </div>

      {/* 상담 목록 */}
      <div className="flex flex-1 flex-col">
        {recent.length === 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] text-muted-foreground">
            <MessageSquare className="size-3" />
            <span>상담 기록 없음</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {recent.map((c) => (
              <ConsultationRow key={c.id} consultation={c} />
            ))}
            {consultations.length > 3 && (
              <li className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">
                +{consultations.length - 3}건 더
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 액션 */}
      <button
        type="button"
        onClick={onAdd}
        className="border-t border-border/60 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="mr-1 inline size-3" />
        이 사람과 상담 추가
      </button>
    </div>
  );
}

function ConsultationRow({ consultation }: { consultation: Consultation }) {
  const typeLabel =
    consultationTypeLabels[consultation.type] ?? consultation.type;
  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{typeLabel}</span>
        <span>{formatDateTime(consultation.createdAt)}</span>
      </div>
      {consultation.content ? (
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-foreground">
          {consultation.content}
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] text-muted-foreground">내용 없음</p>
      )}
    </li>
  );
}
