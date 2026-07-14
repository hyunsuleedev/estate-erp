/**
 * 계약서 당사자 편집 (레거시 DMIN 당사자 그리드 — TPCT02S/TPCT28S 대응).
 *
 * - side 'one'(매도/임대측) N명 + 'two'(매수/임차측) N명 + 'office'(중개사무소) 행
 * - 당사자별 대리인(agents) 0~2명 중첩
 * - 저장은 api.contracts.replaceParties 단일 호출 (전체 교체)
 * - 서버가 잔금+15일 후 idNumber 를 '******' 마스킹해 내려주므로,
 *   미수정 마스킹 값은 read-only 로 두고 기존 행의 id(ContractParty.id)를
 *   payload 에 실어 보낸다 — 서버가 id+이름 일치로 본인 원본을 보존하므로
 *   순서 변경/삭제에도 안전하다. 이름이 바뀐 행은 보존이 거부되므로
 *   저장 전에 재입력을 요구한다.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CirclePlus,
  Link2,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contact,
  Contract,
  ContractParty,
  ContractPartyAgentInput,
  ContractPartyIdType,
  ContractPartyInput,
  ContractPartySide,
} from '@estate-erp/api-client';
import { getContractPartySideLabels } from './-document-engine';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ID_TYPE_OPTIONS: Array<{ value: ContractPartyIdType; label: string }> = [
  { value: 'resident', label: '주민등록번호' },
  { value: 'corporate', label: '법인등록번호' },
  { value: 'foreign', label: '외국인등록번호' },
  { value: 'birth', label: '생년월일' },
];

const ID_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ID_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

// 거래유형 → 당사자 역할 라벨(§2.1 (e) 표)은 shared 엔진의
// getContractPartySideLabels 단일 구현을 사용한다 (엔진 기본 역할 라벨과 통일).

type AgentRowForm = {
  uid: string;
  /** 기존 행 참조 (ContractParty.id) — 마스킹 idNumber 보존 매칭용 */
  agentId: string | null;
  agentLabel: string;
  name: string;
  idType: string;
  idNumber: string;
  /** 서버 마스킹 값('*' 포함)을 아직 수정하지 않음 */
  idNumberMasked: boolean;
  /** 로드 시점 성명 — 마스킹 보존은 이름 일치가 필요하므로 변경 감지용 */
  originalName: string;
  address: string;
  phone: string;
  mobilePhone: string;
  country: string;
  contactId: string | null;
  contactName: string | null;
};

type PartyRowForm = {
  uid: string;
  /** 기존 행 참조 (ContractParty.id) — 마스킹 idNumber 보존 매칭용 */
  partyId: string | null;
  side: ContractPartySide;
  role: string;
  name: string;
  idType: string;
  idNumber: string;
  idNumberMasked: boolean;
  /** 로드 시점 성명 — 마스킹 보존은 이름 일치가 필요하므로 변경 감지용 */
  originalName: string;
  address: string;
  phone: string;
  mobilePhone: string;
  sharePercent: string;
  country: string;
  contactId: string | null;
  contactName: string | null;
  officeName: string;
  officeRegNo: string;
  partnerOfficeId: string | null;
  agents: AgentRowForm[];
};

let uidCounter = 0;
function newUid() {
  uidCounter += 1;
  return `party-${uidCounter}`;
}

function isMaskedIdNumber(value: string | null | undefined): boolean {
  return Boolean(value && value.includes('*'));
}

function emptyPartyRow(side: ContractPartySide): PartyRowForm {
  return {
    uid: newUid(),
    partyId: null,
    side,
    role: '',
    name: '',
    idType: '',
    idNumber: '',
    idNumberMasked: false,
    originalName: '',
    address: '',
    phone: '',
    mobilePhone: '',
    sharePercent: '',
    country: '',
    contactId: null,
    contactName: null,
    officeName: '',
    officeRegNo: '',
    partnerOfficeId: null,
    agents: [],
  };
}

function emptyAgentRow(): AgentRowForm {
  return {
    uid: newUid(),
    agentId: null,
    agentLabel: '',
    name: '',
    idType: '',
    idNumber: '',
    idNumberMasked: false,
    originalName: '',
    address: '',
    phone: '',
    mobilePhone: '',
    country: '',
    contactId: null,
    contactName: null,
  };
}

function toPartySide(side: string): ContractPartySide {
  return side === 'two' || side === 'office' ? side : 'one';
}

function toPartyRows(parties: ContractParty[]): PartyRowForm[] {
  return parties
    .filter((party) => !party.parentId)
    .map((party) => ({
      uid: newUid(),
      partyId: party.id ?? null,
      side: toPartySide(party.side),
      role: party.role ?? '',
      name: party.name ?? '',
      idType: party.idType ?? '',
      idNumber: party.idNumber ?? '',
      idNumberMasked: isMaskedIdNumber(party.idNumber),
      originalName: party.name ?? '',
      address: party.address ?? '',
      phone: party.phone ?? '',
      mobilePhone: party.mobilePhone ?? '',
      sharePercent: party.sharePercent ?? '',
      country: party.country ?? '',
      contactId: party.contactId ?? null,
      contactName: null,
      officeName: party.officeName ?? '',
      officeRegNo: party.officeRegNo ?? '',
      partnerOfficeId: party.partnerOfficeId ?? null,
      agents: (party.agents ?? []).map((agent) => ({
        uid: newUid(),
        agentId: agent.id ?? null,
        agentLabel: agent.agentLabel ?? '',
        name: agent.name ?? '',
        idType: agent.idType ?? '',
        idNumber: agent.idNumber ?? '',
        idNumberMasked: isMaskedIdNumber(agent.idNumber),
        originalName: agent.name ?? '',
        address: agent.address ?? '',
        phone: agent.phone ?? '',
        mobilePhone: agent.mobilePhone ?? '',
        country: agent.country ?? '',
        contactId: agent.contactId ?? null,
        contactName: null,
      })),
    }));
}

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toIdType(value: string): ContractPartyIdType | undefined {
  return value === 'resident' ||
    value === 'corporate' ||
    value === 'foreign' ||
    value === 'birth'
    ? value
    : undefined;
}

/**
 * 저장 payload 생성. subId 는 side 내 배열 순서(1부터)로 명시 부여하고,
 * 기존 행은 id(ContractParty.id)를 함께 실어 서버의 마스킹 idNumber 보존이
 * 위치가 아닌 본인 행 기준으로 매칭되게 한다.
 */
function buildPartiesPayload(rows: PartyRowForm[]): ContractPartyInput[] {
  const sideCounters: Partial<Record<ContractPartySide, number>> = {};

  return rows.map((row) => {
    const subId = (sideCounters[row.side] ?? 0) + 1;
    sideCounters[row.side] = subId;

    const isOffice = row.side === 'office';
    const agents = isOffice
      ? []
      : row.agents
          .filter((agent) => agent.name.trim())
          .map<ContractPartyAgentInput>((agent) => ({
            id: agent.agentId ?? undefined,
            name: agent.name.trim(),
            agentLabel: trimToUndefined(agent.agentLabel),
            idType: toIdType(agent.idType),
            idNumber: trimToUndefined(agent.idNumber),
            address: trimToUndefined(agent.address),
            phone: trimToUndefined(agent.phone),
            mobilePhone: trimToUndefined(agent.mobilePhone),
            country: trimToUndefined(agent.country),
            contactId: agent.contactId ?? undefined,
          }));

    return {
      id: row.partyId ?? undefined,
      side: row.side,
      subId,
      role: trimToUndefined(row.role),
      name: row.name.trim(),
      idType: toIdType(row.idType),
      idNumber: trimToUndefined(row.idNumber),
      address: trimToUndefined(row.address),
      phone: trimToUndefined(row.phone),
      mobilePhone: trimToUndefined(row.mobilePhone),
      sharePercent: isOffice ? undefined : trimToUndefined(row.sharePercent),
      country: trimToUndefined(row.country),
      contactId: row.contactId ?? undefined,
      officeName: isOffice ? trimToUndefined(row.officeName) : undefined,
      officeRegNo: isOffice ? trimToUndefined(row.officeRegNo) : undefined,
      partnerOfficeId: isOffice ? row.partnerOfficeId ?? undefined : undefined,
      agents: agents.length > 0 ? agents : undefined,
    };
  });
}

/**
 * 저장 전 검증.
 * - 사람 행은 성명, 사무소 행은 사무소명 필수
 * - 마스킹 idNumber 보존은 서버가 기존 행 id + 이름 일치로 매칭하므로,
 *   순서 변경/삭제는 허용하되 성명이 바뀐 행(다른 사람으로 재활용)은
 *   저장 전에 재입력을 요구한다.
 */
function validatePartyRows(rows: PartyRowForm[]): string | null {
  for (const row of rows) {
    if (row.side === 'office') {
      if (!row.officeName.trim()) {
        return '중개사무소 행에는 사무소 명칭을 입력해주세요.';
      }
    } else if (!row.name.trim()) {
      return '당사자 성명을 입력해주세요.';
    }

    if (
      row.idNumberMasked &&
      row.idNumber &&
      row.name.trim() !== row.originalName.trim()
    ) {
      return `${row.name.trim() || row.originalName || '당사자'}의 성명이 변경되어 마스킹된 식별번호를 보존할 수 없습니다. 식별번호를 재입력한 뒤 저장해주세요.`;
    }

    for (const agent of row.agents) {
      if (!agent.name.trim()) continue;
      if (
        agent.idNumberMasked &&
        agent.idNumber &&
        agent.name.trim() !== agent.originalName.trim()
      ) {
        return `${agent.name.trim()} (대리인)의 성명이 변경되어 마스킹된 식별번호를 보존할 수 없습니다. 식별번호를 재입력한 뒤 저장해주세요.`;
      }
    }
  }

  return null;
}

export function ContractPartiesCard({ contract }: { contract: Contract }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PartyRowForm[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sideLabels = getContractPartySideLabels(contract.transactionType);

  useEffect(() => {
    setRows(toPartyRows(contract.parties ?? []));
    setError(null);
  }, [contract.id, contract.parties]);

  const saveMutation = useMutation({
    mutationFn: (parties: ContractPartyInput[]) =>
      api.contracts.replaceParties(contract.id, { parties }),
    onSuccess: () => {
      setError(null);
      toast.success('계약 당사자를 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', contract.id] });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : '당사자를 저장하지 못했습니다.',
      );
    },
  });

  function updateRow(uid: string, patch: Partial<PartyRowForm>) {
    setRows((prev) =>
      prev.map((row) => (row.uid === uid ? { ...row, ...patch } : row)),
    );
  }

  function updateAgent(rowUid: string, agentUid: string, patch: Partial<AgentRowForm>) {
    setRows((prev) =>
      prev.map((row) =>
        row.uid === rowUid
          ? {
              ...row,
              agents: row.agents.map((agent) =>
                agent.uid === agentUid ? { ...agent, ...patch } : agent,
              ),
            }
          : row,
      ),
    );
  }

  function addRow(side: ContractPartySide) {
    setRows((prev) => {
      const next = [...prev];
      // 같은 side 그룹의 끝에 삽입 (one → two → office 그룹 순서 유지)
      const order: Record<ContractPartySide, number> = { one: 0, two: 1, office: 2 };
      let insertAt = next.length;
      for (let index = 0; index < next.length; index += 1) {
        if (order[next[index].side] > order[side]) {
          insertAt = index;
          break;
        }
      }
      next.splice(insertAt, 0, emptyPartyRow(side));
      return next;
    });
  }

  function removeRow(uid: string) {
    setRows((prev) => prev.filter((row) => row.uid !== uid));
  }

  function moveRow(uid: string, direction: 'up' | 'down') {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.uid === uid);
      if (index < 0) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      if (prev[target].side !== prev[index].side) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addAgent(rowUid: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.uid === rowUid && row.agents.length < 2
          ? { ...row, agents: [...row.agents, emptyAgentRow()] }
          : row,
      ),
    );
  }

  function removeAgent(rowUid: string, agentUid: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.uid === rowUid
          ? { ...row, agents: row.agents.filter((agent) => agent.uid !== agentUid) }
          : row,
      ),
    );
  }

  function save() {
    const validationError = validatePartyRows(rows);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    saveMutation.mutate(buildPartiesPayload(rows));
  }

  const sideOneRows = rows.filter((row) => row.side === 'one');
  const sideTwoRows = rows.filter((row) => row.side === 'two');
  const officeRows = rows.filter((row) => row.side === 'office');

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">계약 당사자</CardTitle>
            <CardDescription>
              {sideLabels.one} {sideOneRows.length}명 · {sideLabels.two}{' '}
              {sideTwoRows.length}명 · 중개사무소 {officeRows.length}곳 — 저장 시
              전체 목록이 교체됩니다.
            </CardDescription>
          </div>
          <Button onClick={save} disabled={saveMutation.isPending}>
            당사자 저장
          </Button>
        </div>
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6 px-5">
        <PartySideSection
          title={`${sideLabels.one} (매도/임대측)`}
          sideLabel={sideLabels.one}
          rows={sideOneRows}
          onAdd={() => addRow('one')}
          onUpdate={updateRow}
          onUpdateAgent={updateAgent}
          onRemove={removeRow}
          onMove={moveRow}
          onAddAgent={addAgent}
          onRemoveAgent={removeAgent}
        />
        <PartySideSection
          title={`${sideLabels.two} (매수/임차측)`}
          sideLabel={sideLabels.two}
          rows={sideTwoRows}
          onAdd={() => addRow('two')}
          onUpdate={updateRow}
          onUpdateAgent={updateAgent}
          onRemove={removeRow}
          onMove={moveRow}
          onAddAgent={addAgent}
          onRemoveAgent={removeAgent}
        />
        <OfficeSideSection
          rows={officeRows}
          onAdd={() => addRow('office')}
          onUpdate={updateRow}
          onRemove={removeRow}
          onMove={moveRow}
        />
      </CardContent>
    </Card>
  );
}

function PartySideSection({
  title,
  sideLabel,
  rows,
  onAdd,
  onUpdate,
  onUpdateAgent,
  onRemove,
  onMove,
  onAddAgent,
  onRemoveAgent,
}: {
  title: string;
  sideLabel: string;
  rows: PartyRowForm[];
  onAdd: () => void;
  onUpdate: (uid: string, patch: Partial<PartyRowForm>) => void;
  onUpdateAgent: (rowUid: string, agentUid: string, patch: Partial<AgentRowForm>) => void;
  onRemove: (uid: string) => void;
  onMove: (uid: string, direction: 'up' | 'down') => void;
  onAddAgent: (rowUid: string) => void;
  onRemoveAgent: (rowUid: string, agentUid: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <CirclePlus className="size-3.5" />
          공동 {sideLabel} 추가
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {sideLabel} 정보가 없습니다. 추가 버튼으로 등록하세요.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <PartyRowEditor
              key={row.uid}
              row={row}
              orderLabel={
                rows.length > 1 ? `${sideLabel} ${index + 1}` : sideLabel
              }
              isRepresentative={index === 0}
              canMoveUp={index > 0}
              canMoveDown={index < rows.length - 1}
              onUpdate={onUpdate}
              onUpdateAgent={onUpdateAgent}
              onRemove={onRemove}
              onMove={onMove}
              onAddAgent={onAddAgent}
              onRemoveAgent={onRemoveAgent}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartyRowEditor({
  row,
  orderLabel,
  isRepresentative,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onUpdateAgent,
  onRemove,
  onMove,
  onAddAgent,
  onRemoveAgent,
}: {
  row: PartyRowForm;
  orderLabel: string;
  isRepresentative: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (uid: string, patch: Partial<PartyRowForm>) => void;
  onUpdateAgent: (rowUid: string, agentUid: string, patch: Partial<AgentRowForm>) => void;
  onRemove: (uid: string) => void;
  onMove: (uid: string, direction: 'up' | 'down') => void;
  onAddAgent: (rowUid: string) => void;
  onRemoveAgent: (rowUid: string, agentUid: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-md border border-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{orderLabel}</Badge>
          {isRepresentative ? (
            <span className="text-xs text-muted-foreground">대표</span>
          ) : null}
          {row.contactId ? (
            <Badge variant="outline" className="gap-1">
              <Link2 className="size-3" />
              연락처 연결됨
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => onUpdate(row.uid, { contactId: null, contactName: null })}
                aria-label="연락처 연결 해제"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : (
            <ContactLinkPicker
              onSelect={(contact) =>
                onUpdate(row.uid, {
                  contactId: contact.id,
                  contactName: contact.name,
                  name: row.name || contact.name,
                  phone: row.phone || contact.phone || '',
                })
              }
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!canMoveUp}
            onClick={() => onMove(row.uid, 'up')}
            aria-label="위로 이동"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!canMoveDown}
            onClick={() => onMove(row.uid, 'down')}
            aria-label="아래로 이동"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onRemove(row.uid)}
            aria-label="당사자 삭제"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PartyField label="성명">
          <Input
            value={row.name}
            onChange={(event) => onUpdate(row.uid, { name: event.target.value })}
          />
        </PartyField>
        <PartyField label="식별번호 유형">
          <Select
            value={row.idType || undefined}
            onValueChange={(value) => onUpdate(row.uid, { idType: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PartyField>
        <MaskableIdNumberField
          label={ID_TYPE_LABELS[row.idType] ?? '식별번호'}
          value={row.idNumber}
          masked={row.idNumberMasked}
          onChange={(value) => onUpdate(row.uid, { idNumber: value })}
          onReenter={() =>
            onUpdate(row.uid, { idNumber: '', idNumberMasked: false })
          }
        />
        <PartyField label="국적">
          <Input
            value={row.country}
            onChange={(event) => onUpdate(row.uid, { country: event.target.value })}
            placeholder="대한민국"
          />
        </PartyField>
        <PartyField label="주소" className="md:col-span-2 xl:col-span-4">
          <Input
            value={row.address}
            onChange={(event) => onUpdate(row.uid, { address: event.target.value })}
          />
        </PartyField>
        <PartyField label="전화">
          <Input
            value={row.phone}
            onChange={(event) => onUpdate(row.uid, { phone: event.target.value })}
          />
        </PartyField>
        <PartyField label="휴대폰">
          <Input
            value={row.mobilePhone}
            onChange={(event) =>
              onUpdate(row.uid, { mobilePhone: event.target.value })
            }
          />
        </PartyField>
        <PartyField label="거래지분">
          <Input
            value={row.sharePercent}
            onChange={(event) =>
              onUpdate(row.uid, { sharePercent: event.target.value })
            }
            placeholder="2분의 1"
          />
        </PartyField>
        <PartyField label="표기 라벨 (선택)">
          <Input
            value={row.role}
            onChange={(event) => onUpdate(row.uid, { role: event.target.value })}
            placeholder="비우면 거래유형에서 자동"
          />
        </PartyField>
      </div>

      <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            대리인 ({row.agents.length}/2)
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddAgent(row.uid)}
            disabled={row.agents.length >= 2}
          >
            <UserRoundPlus className="size-3.5" />
            대리인 추가
          </Button>
        </div>
        {row.agents.map((agent, agentIndex) => (
          <div
            key={agent.uid}
            className="space-y-3 rounded-md border border-border/50 bg-background p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline">
                {agent.agentLabel || (agentIndex === 0 ? '대리인' : '공동대리인')}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive"
                onClick={() => onRemoveAgent(row.uid, agent.uid)}
                aria-label="대리인 삭제"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <PartyField label="성명">
                <Input
                  value={agent.name}
                  onChange={(event) =>
                    onUpdateAgent(row.uid, agent.uid, { name: event.target.value })
                  }
                />
              </PartyField>
              <PartyField label="라벨">
                <Input
                  value={agent.agentLabel}
                  onChange={(event) =>
                    onUpdateAgent(row.uid, agent.uid, {
                      agentLabel: event.target.value,
                    })
                  }
                  placeholder={agentIndex === 0 ? '대리인' : '공동대리인'}
                />
              </PartyField>
              <PartyField label="식별번호 유형">
                <Select
                  value={agent.idType || undefined}
                  onValueChange={(value) =>
                    onUpdateAgent(row.uid, agent.uid, { idType: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PartyField>
              <MaskableIdNumberField
                label={ID_TYPE_LABELS[agent.idType] ?? '식별번호'}
                value={agent.idNumber}
                masked={agent.idNumberMasked}
                onChange={(value) =>
                  onUpdateAgent(row.uid, agent.uid, { idNumber: value })
                }
                onReenter={() =>
                  onUpdateAgent(row.uid, agent.uid, {
                    idNumber: '',
                    idNumberMasked: false,
                  })
                }
              />
              <PartyField label="주소" className="md:col-span-2">
                <Input
                  value={agent.address}
                  onChange={(event) =>
                    onUpdateAgent(row.uid, agent.uid, {
                      address: event.target.value,
                    })
                  }
                />
              </PartyField>
              <PartyField label="전화">
                <Input
                  value={agent.phone}
                  onChange={(event) =>
                    onUpdateAgent(row.uid, agent.uid, { phone: event.target.value })
                  }
                />
              </PartyField>
              <PartyField label="휴대폰">
                <Input
                  value={agent.mobilePhone}
                  onChange={(event) =>
                    onUpdateAgent(row.uid, agent.uid, {
                      mobilePhone: event.target.value,
                    })
                  }
                />
              </PartyField>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficeSideSection({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  rows: PartyRowForm[];
  onAdd: () => void;
  onUpdate: (uid: string, patch: Partial<PartyRowForm>) => void;
  onRemove: (uid: string) => void;
  onMove: (uid: string, direction: 'up' | 'down') => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">중개사무소 (공동중개 포함)</p>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <CirclePlus className="size-3.5" />
          사무소 추가
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          중개사무소 행이 없습니다. 우리 사무소와 공동중개 사무소를 추가하세요.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.uid} className="space-y-3 rounded-md border border-border/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">
                  {index === 0 ? '개업공인중개사' : `공동중개 ${index}`}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index === 0}
                    onClick={() => onMove(row.uid, 'up')}
                    aria-label="위로 이동"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index === rows.length - 1}
                    onClick={() => onMove(row.uid, 'down')}
                    aria-label="아래로 이동"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => onRemove(row.uid)}
                    aria-label="사무소 삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <PartyField label="사무소 명칭">
                  <Input
                    value={row.officeName}
                    onChange={(event) =>
                      onUpdate(row.uid, { officeName: event.target.value })
                    }
                  />
                </PartyField>
                <PartyField label="개설등록번호">
                  <Input
                    value={row.officeRegNo}
                    onChange={(event) =>
                      onUpdate(row.uid, { officeRegNo: event.target.value })
                    }
                  />
                </PartyField>
                <PartyField label="대표 성명">
                  <Input
                    value={row.name}
                    onChange={(event) => onUpdate(row.uid, { name: event.target.value })}
                  />
                </PartyField>
                <PartyField label="전화">
                  <Input
                    value={row.phone}
                    onChange={(event) => onUpdate(row.uid, { phone: event.target.value })}
                  />
                </PartyField>
                <PartyField label="소재지" className="md:col-span-2 xl:col-span-4">
                  <Input
                    value={row.address}
                    onChange={(event) =>
                      onUpdate(row.uid, { address: event.target.value })
                    }
                  />
                </PartyField>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PartyField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/**
 * 마스킹된 식별번호 필드.
 * 서버가 '******' 마스킹한 값은 read-only 로 표시하고, "재입력" 버튼으로
 * 비운 뒤에만 편집 가능 — 마스킹 문자열이 그대로 새 값으로 저장되는 사고 방지.
 */
function MaskableIdNumberField({
  label,
  value,
  masked,
  onChange,
  onReenter,
}: {
  label: string;
  value: string;
  masked: boolean;
  onChange: (value: string) => void;
  onReenter: () => void;
}) {
  if (masked) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2">
          <div className="flex h-9 flex-1 items-center rounded-md border border-border/60 bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
            {value}
          </div>
          <Button variant="outline" size="sm" onClick={onReenter}>
            재입력
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          보존기간 경과로 마스킹된 값입니다. 수정하려면 재입력하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

/** 기존 연락처 검색 → 당사자 연결 (contactId) */
function ContactLinkPicker({ onSelect }: { onSelect: (contact: Contact) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contract-party-contacts', query],
    queryFn: () =>
      api.contacts.findAll({
        search: query || undefined,
        limit: 8,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: open,
  });

  const contacts = useMemo(() => data?.items ?? [], [data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Link2 className="size-3" />
          연락처 연결
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="이름, 전화번호 검색"
          />
          <CommandList className="max-h-52">
            <CommandEmpty>
              {isLoading ? '검색 중...' : '연락처가 없습니다.'}
            </CommandEmpty>
            <CommandGroup>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={contact.id}
                  onSelect={() => {
                    onSelect(contact);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{contact.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {contact.phone ?? '연락처 없음'}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
