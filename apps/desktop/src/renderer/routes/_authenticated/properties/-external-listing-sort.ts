import type {
  ExternalListingGroup,
  ExternalListingTransactionType,
} from '@estate-erp/api-client';
import type { SortingState } from '@tanstack/react-table';

const naturalCollator = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
});

type SortValue = number | string | null | undefined;

function getPrice(
  group: ExternalListingGroup,
  transactionType: ExternalListingTransactionType,
): number | null {
  const listing = group.mainExternalListing;
  if (!listing) return null;
  if (transactionType === 'sale') return listing.price ?? null;
  return listing.deposit ?? null;
}

function getSortValue(
  group: ExternalListingGroup,
  columnId: string,
  transactionType: ExternalListingTransactionType,
): SortValue {
  switch (columnId) {
    case 'site':
      return group.site?.name;
    case 'dong':
      return group.buildingName;
    case 'floor':
      return group.mainExternalListing?.floorInfo;
    case 'ho':
      return group.ho;
    case 'type':
      return group.areaName;
    case 'area':
      return (
        group.mainExternalListing?.exclusiveAreaM2 ?? group.exclusiveAreaM2
      );
    case 'direction':
      return group.mainExternalListing?.direction;
    case 'myAd':
      return group.ownAdvertisementYmd;
    case 'owner':
      return group.ownerVerified ? 1 : 0;
    case 'duplicate':
      return (
        group.offerRanking ??
        group.mainExternalListing?.sameAddrCnt ??
        group.listingCount
      );
    case 'price':
      return getPrice(group, transactionType);
    case 'priceMin':
      return group.priceMin;
    case 'priceMax':
      return group.priceMax;
    default:
      return null;
  }
}

function compareValues(
  left: SortValue,
  right: SortValue,
  direction: 1 | -1,
): number {
  const leftEmpty = left == null || left === '';
  const rightEmpty = right == null || right === '';
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * direction;
  }
  return naturalCollator.compare(String(left), String(right)) * direction;
}

export function sortExternalListingGroups(
  groups: ExternalListingGroup[],
  sorting: SortingState,
  transactionType: ExternalListingTransactionType,
): ExternalListingGroup[] {
  const activeSort = sorting[0];
  if (!activeSort) return groups;

  const direction = activeSort.desc ? -1 : 1;
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const comparison = compareValues(
        getSortValue(left.group, activeSort.id, transactionType),
        getSortValue(right.group, activeSort.id, transactionType),
        direction,
      );
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ group }) => group);
}
