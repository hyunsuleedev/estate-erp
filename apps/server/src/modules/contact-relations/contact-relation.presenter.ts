import { invertContactRelationType } from '@estate-erp/shared';

interface ContactRelationPerspectiveSource {
  relationType: string;
  label: string | null;
  inverseLabel: string | null;
}

/**
 * 한 번만 저장한 관계를 현재 연락처 관점으로 표현한다.
 *
 * DB의 relationType은 항상 relatedContact → contact 방향이다. relatedContact
 * 화면에서 읽을 때만 역관계를 파생해 부모/자녀 같은 비대칭 관계를 바로잡는다.
 */
export function withContactRelationPerspective<
  T extends ContactRelationPerspectiveSource,
>(relation: T, isReverse: boolean) {
  return {
    ...relation,
    isReverse,
    displayRelationType: isReverse
      ? invertContactRelationType(relation.relationType)
      : relation.relationType,
    displayLabel: (isReverse ? relation.inverseLabel : relation.label) ?? null,
  };
}
