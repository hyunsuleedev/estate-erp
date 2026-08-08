import { withContactRelationPerspective } from './contact-relation.presenter';

describe('withContactRelationPerspective', () => {
  it('부모 관계를 반대쪽에서는 자녀로 표현한다', () => {
    const relation = {
      relationType: 'parent',
      label: '어머니',
      inverseLabel: '둘째 아들',
    };

    expect(withContactRelationPerspective(relation, false)).toMatchObject({
      isReverse: false,
      displayRelationType: 'parent',
      displayLabel: '어머니',
    });
    expect(withContactRelationPerspective(relation, true)).toMatchObject({
      isReverse: true,
      displayRelationType: 'child',
      displayLabel: '둘째 아들',
    });
  });

  it('전문가 관계를 반대쪽에서는 의뢰인으로 표현한다', () => {
    expect(
      withContactRelationPerspective(
        { relationType: 'lawyer', label: null, inverseLabel: null },
        true,
      ),
    ).toMatchObject({
      displayRelationType: 'client',
      displayLabel: null,
    });
  });

  it('배우자처럼 대칭인 관계는 방향이 바뀌어도 유형을 유지한다', () => {
    expect(
      withContactRelationPerspective(
        { relationType: 'spouse', label: null, inverseLabel: null },
        true,
      ).displayRelationType,
    ).toBe('spouse');
  });
});
