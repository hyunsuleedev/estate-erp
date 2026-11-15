/**
 * 진행 계획의 순서 계산.
 *
 * 서버는 단계마다 sortOrder를 갖는다. 같은 번호는 동시 진행이다. 화면은 단계를 한
 * 줄씩 위아래로 옮기거나 "앞 단계와 동시에"를 켜고 끄는데, 그때마다 모든 단계의
 * 번호를 1부터 빈틈없이 다시 매겨 통째로 보낸다(서버가 일부만 받지 않는다).
 */
export interface PlanStepPosition {
  id: string;
  /** 1부터 빈틈없이 매긴 차례. 같은 번호면 동시 진행. */
  sortOrder: number;
}

interface OrderedItem {
  id: string;
  /** 앞 줄과 같은 번호를 쓰는지. 첫 줄은 항상 false. */
  withPrevious: boolean;
}

/** 서버가 준 순서(정렬되어 있다)를 1부터 빈틈없는 번호로 맞춘다. */
export function planStepOrder(
  steps: ReadonlyArray<{ id: string; sortOrder: number }>,
): PlanStepPosition[] {
  return renumber(
    steps.map((step, index) => ({
      id: step.id,
      withPrevious: index > 0 && steps[index - 1]?.sortOrder === step.sortOrder,
    })),
  );
}

/**
 * 한 줄을 위나 아래로 옮긴다. 옮긴 줄은 혼자 진행하는 단계가 되고, 그 줄이 빠진
 * 자리의 동시 진행 묶음은 유지된다.
 */
export function moveStep(
  order: ReadonlyArray<PlanStepPosition>,
  index: number,
  direction: "up" | "down",
): PlanStepPosition[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (
    index < 0 ||
    index >= order.length ||
    target < 0 ||
    target >= order.length
  ) {
    return [...order];
  }
  const items = toItems(order);
  const moved = items[index];
  const other = items[target];
  if (!moved || !other) return [...order];

  // 묶음의 첫 줄이 빠지면 그다음 줄이 묶음의 첫 줄이 된다.
  const next = items[index + 1];
  if (next?.withPrevious && !moved.withPrevious) next.withPrevious = false;

  items.splice(index, 1);
  items.splice(target, 0, { id: moved.id, withPrevious: false });
  // 옮긴 줄이 묶음 한가운데로 들어가면 그 뒤 줄들은 옮긴 줄과 묶이지 않게 끊는다.
  const after = items[target + 1];
  if (after?.withPrevious) after.withPrevious = false;
  return renumber(items);
}

/** "앞 단계와 동시에"를 켜거나 끈다. 첫 줄에는 적용되지 않는다. */
export function toggleWithPrevious(
  order: ReadonlyArray<PlanStepPosition>,
  index: number,
): PlanStepPosition[] {
  if (index <= 0 || index >= order.length) return [...order];
  const items = toItems(order);
  const item = items[index];
  if (!item) return [...order];
  item.withPrevious = !item.withPrevious;
  return renumber(items);
}

function toItems(order: ReadonlyArray<PlanStepPosition>): OrderedItem[] {
  return order.map((position, index) => ({
    id: position.id,
    withPrevious:
      index > 0 && order[index - 1]?.sortOrder === position.sortOrder,
  }));
}

function renumber(items: ReadonlyArray<OrderedItem>): PlanStepPosition[] {
  let current = 0;
  return items.map((item, index) => {
    if (index === 0 || !item.withPrevious) current += 1;
    return { id: item.id, sortOrder: current };
  });
}
