export interface NewPropertySuccessTabActionInput {
  propertyId: string;
  registrationTabId: string | null;
}

export interface NewPropertySuccessTabAction {
  detailRoute: string;
  closeTabId: string | null;
}

export function getNewPropertySuccessTabAction({
  propertyId,
  registrationTabId,
}: NewPropertySuccessTabActionInput): NewPropertySuccessTabAction {
  return {
    detailRoute: `/properties/${propertyId}`,
    closeTabId: registrationTabId,
  };
}

const TRANSACTION_TYPE_ORDER = ['sale', 'jeonse', 'monthly', 'yearly_rent'] as const;

export type NewPropertyTransactionType = (typeof TRANSACTION_TYPE_ORDER)[number];

export function toggleTransactionType(
  selected: NewPropertyTransactionType[],
  next: NewPropertyTransactionType,
): NewPropertyTransactionType[] {
  if (selected.includes(next)) {
    return selected.length === 1 ? selected : selected.filter((type) => type !== next);
  }

  return TRANSACTION_TYPE_ORDER.filter((type) => type === next || selected.includes(type));
}
