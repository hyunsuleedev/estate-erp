import { createFileRoute } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { RequirementLedger } from './-buyer-customers/requirement-ledger';
import { CustomerWorkbench } from './-buyer-customers/customer-workbench';
import { ReadinessBoard } from './-buyer-customers/readiness-board';
import './-buyer-customers/prototype.css';

interface PrototypeSearch {
  v: number;
}

export const Route = createFileRoute('/_authenticated/prototypes/buyer-customers')({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => {
    const parsed = Number(search.v);
    return { v: Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 1 };
  },
  component: BuyerCustomerPrototypes,
});

const VARIANTS: Array<{ name: string; component: ComponentType }> = [
  { name: '요건 원장', component: RequirementLedger },
  { name: '고객 워크벤치', component: CustomerWorkbench },
  { name: '준비도 보드', component: ReadinessBoard },
];

function BuyerCustomerPrototypes() {
  const { v } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeIndex = v - 1;
  const ActiveVariant = VARIANTS[activeIndex].component;
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef<HTMLElement | null>(null);
  const highlightRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveHighlight = useCallback(() => {
    const item = itemRefs.current[activeIndex];
    const highlight = highlightRef.current;
    if (!item || !highlight) return;

    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [activeIndex]);

  const selectVariant = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= VARIANTS.length) return;
      void navigate({ search: { v: nextIndex + 1 }, replace: true });
      setRevision((current) => current + 1);
    },
    [navigate],
  );

  const replay = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useLayoutEffect(() => {
    moveHighlight();
  }, [moveHighlight]);

  useEffect(() => {
    window.addEventListener('resize', moveHighlight);
    return () => window.removeEventListener('resize', moveHighlight);
  }, [moveHighlight]);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setReady(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= VARIANTS.length) {
        selectVariant(number - 1);
      } else if (event.key === 'ArrowRight') {
        selectVariant((activeIndex + 1) % VARIANTS.length);
      } else if (event.key === 'ArrowLeft') {
        selectVariant((activeIndex - 1 + VARIANTS.length) % VARIANTS.length);
      } else if (event.key === 'r' || event.key === 'R') {
        replay();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, replay, selectVariant]);

  return (
    <div className="-m-4 flex min-h-0 flex-1 overflow-hidden">
      <div key={`${activeIndex}-${revision}`} className="min-h-0 min-w-0 flex-1">
        <ActiveVariant />
      </div>

      <nav
        ref={pickerRef}
        className="proto-picker"
        aria-label="Prototype variants"
        data-ready={ready ? '' : undefined}
      >
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {VARIANTS.map((variant, index) => {
          const isActive = activeIndex === index;
          return (
            <button
              key={variant.name}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              className="proto-picker-item"
              data-active={isActive ? '' : undefined}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => selectVariant(index)}
            >
              {variant.name}
            </button>
          );
        })}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={replay}
        >
          ↻
        </button>
      </nav>
    </div>
  );
}
