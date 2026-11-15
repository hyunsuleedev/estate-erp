export type CellSaveResult = boolean | void | Promise<boolean | void>;
export type CellNavigation = 'current' | 'next' | 'previous' | 'down' | 'none';

export type CellDraft = {
  text?: string;
  chipOptionValue?: string;
  range?: { from?: string; to?: string };
  month?: string;
  saving?: boolean;
  error?: string;
};

/** One table/provider owns its drafts, including a save that outlives a virtual row. */
export class CellDraftStore {
  private drafts = new Map<string, CellDraft>();
  private listeners = new Set<() => void>();

  get = (key: string) => this.drafts.get(key);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify() {
    this.listeners.forEach((listener) => listener());
  }
  patch(key: string, patch: Partial<CellDraft>) {
    this.drafts.set(key, { ...this.get(key), ...patch });
    this.notify();
  }
  delete(key: string) {
    this.drafts.delete(key);
    this.notify();
  }
  async save(key: string, commit: () => CellSaveResult): Promise<boolean> {
    if (this.get(key)?.saving) return false;
    this.patch(key, { saving: true, error: undefined });
    try {
      const accepted = await commit();
      this.patch(key, {
        saving: false,
        error: accepted === false ? '입력값을 확인해 주세요.' : undefined,
      });
      return accepted !== false;
    } catch (error) {
      const conflict =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 409;
      this.patch(key, {
        saving: false,
        error: conflict
          ? '다른 사용자가 수정했습니다. 최신 값을 확인한 뒤 다시 저장해 주세요. 입력은 유지됩니다.'
          : '저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.',
      });
      return false;
    }
  }
}

export function parseCellNumber(
  raw: string,
  minimum?: number,
): { valid: true; value: number | null } | { valid: false; error: string } {
  const text = raw.normalize('NFKC').trim();
  if (!text) return { valid: true, value: null };
  // Group separators must be complete: 1,000 is valid; 1,00 is not a deletion.
  const validNotation = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text);
  const value = Number(text.replaceAll(',', ''));
  if (
    !validNotation ||
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER
  ) {
    return { valid: false, error: '숫자를 확인해 주세요. 예: 1,000 또는 1000' };
  }
  if (minimum !== undefined && value < minimum) {
    return { valid: false, error: `${minimum} 이상의 숫자를 입력해 주세요.` };
  }
  return { valid: true, value };
}

export type TableCellAddress = { rowId: string; columnId: string };

export function moveTableCell(
  cell: TableCellAddress,
  rowIds: readonly string[],
  columnIds: readonly string[],
  direction: 'next' | 'previous' | 'down' | 'up' | 'current',
): TableCellAddress | null {
  const row = rowIds.indexOf(cell.rowId);
  const col = columnIds.indexOf(cell.columnId);
  if (row < 0 || col < 0) return null;
  return {
    rowId:
      rowIds[
        Math.max(
          0,
          Math.min(
            rowIds.length - 1,
            row + (direction === 'down' ? 1 : direction === 'up' ? -1 : 0),
          ),
        )
      ],
    columnId:
      columnIds[
        Math.max(
          0,
          Math.min(
            columnIds.length - 1,
            col +
              (direction === 'next' ? 1 : direction === 'previous' ? -1 : 0),
          ),
        )
      ],
  };
}
