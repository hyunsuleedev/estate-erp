import { useEffect, useRef } from 'react';
import { PropertyRegistrationForm, type PropertyRegistrationResult } from '../-property-registration-form';
import { PropertyInspectorToolbar } from './property-inspector-view';

export function PropertyRegistrationDrawer({
  closing,
  animate,
  pending,
  onClose,
  onExited,
  onCreated,
  onPendingChange,
  onExpanded,
}: {
  closing: boolean;
  animate: boolean;
  pending: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  onCreated: (result: PropertyRegistrationResult) => void;
  onPendingChange: (pending: boolean) => void;
  onExpanded: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || pending) return;
      // Menus and pickers get the first Escape; the next one closes the drawer.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]')) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  return (
    <aside
      ref={panelRef}
      id="property-registration"
      data-property-inspector
      data-property-registration
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="새 매물 등록 패널"
      aria-busy={pending}
      tabIndex={-1}
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 w-[584px] max-w-full flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') onExited();
      }}
    >
      <PropertyRegistrationForm
        presentation="drawer"
        onClose={onClose}
        onCreated={onCreated}
        onPendingChange={onPendingChange}
        onExpanded={onExpanded}
        renderToolbar={(onOpenNewTab) => (
          <PropertyInspectorToolbar
            onClose={onClose}
            closeLabel="등록 패널 닫기"
            closeDisabled={pending}
            onOpenNewTab={onOpenNewTab}
          />
        )}
      />
    </aside>
  );
}
