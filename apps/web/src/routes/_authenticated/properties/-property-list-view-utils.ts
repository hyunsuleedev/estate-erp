type MoveInAvailabilityInput = {
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
};

type TenantPhoneLineInput = {
  contact?: {
    phone?: string | null;
  } | null;
  contractEnd?: string | null;
};

export function getMoveInAvailability(listing: MoveInAvailabilityInput) {
  const type = listing.moveInAvailableType ?? 'unknown';
  const from = listing.moveInAvailableFrom;
  const to = listing.moveInAvailableTo;

  if (type === 'immediate') {
    return {
      label: '즉시',
      detail: null,
      className: 'bg-[#eef3ed] text-[#44745a]',
    };
  }

  if (type === 'date') {
    return {
      label: from ? `${formatDateShort(from)} 이후` : '확인 필요',
      detail: null,
      className: from ? 'bg-[#e7f3f8] text-[#337ea9]' : 'bg-[#f1f1ef] text-[#787774]',
    };
  }

  if (type === 'range') {
    return {
      label: formatMoveInRange(from, to),
      detail: null,
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  if (type === 'negotiable') {
    return {
      label: '협의',
      detail: null,
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  return {
    label: '확인 필요',
    detail: null,
    className: 'bg-[#f1f1ef] text-[#787774]',
  };
}

export function formatMoveInRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatDateShort(from)}~${formatDateShort(to)}`;
  if (from) return `${formatDateShort(from)}~`;
  if (to) return `~${formatDateShort(to)}`;
  return '협의';
}

export function getTenantPhoneLine(tenant: TenantPhoneLineInput) {
  const phone = tenant.contact?.phone;
  if (!phone) return null;

  return tenant.contractEnd
    ? `${phone} · 만기 ${formatDateShort(tenant.contractEnd)}`
    : phone;
}

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}
