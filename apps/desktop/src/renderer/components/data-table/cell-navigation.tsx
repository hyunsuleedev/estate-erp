import { createContext, useContext } from 'react';
import type { CellNavigation } from './cell-edit-state';

type CellTableNavigation = {
  select: (trigger: HTMLElement, focusTable?: boolean) => void;
  clear: (trigger: HTMLElement, recordId?: string) => void;
  finish: (
    trigger: HTMLElement,
    direction: Exclude<CellNavigation, 'none'>,
    recordId?: string,
  ) => void;
};

const Context = createContext<CellTableNavigation | null>(null);
export const CellTableNavigationProvider = Context.Provider;
export const useCellTableNavigation = () => useContext(Context);
