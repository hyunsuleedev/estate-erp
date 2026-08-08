import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { ActionLedger } from "./-customer-ledger/action-ledger";
import { BrokerDecisionLedger } from "./-customer-ledger/action-first-grouped-ledger";
import { CoreLedger } from "./-customer-ledger/core-ledger";
import { GroupedLedger } from "./-customer-ledger/grouped-ledger";
import "./-customer-ledger/prototype.css";

interface PrototypeSearch {
  v: number;
}

export const Route = createFileRoute(
  "/_authenticated/prototypes/customer-ledger",
)({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => {
    const parsed = Number(search.v);
    return {
      v: Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1,
    };
  },
  component: CustomerLedgerPrototypes,
});

const VARIANTS: Array<{ name: string; component: ComponentType }> = [
  { name: "핵심 원장", component: CoreLedger },
  { name: "복수 요건 원장", component: GroupedLedger },
  { name: "후속업무 원장", component: ActionLedger },
  { name: "중개 판단 원장", component: BrokerDecisionLedger },
];

function CustomerLedgerPrototypes() {
  const { v } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeIndex = v - 1;
  const ActiveVariant = VARIANTS[activeIndex].component;
  const [ready, setReady] = useState(false);
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
    },
    [navigate],
  );

  useLayoutEffect(() => {
    moveHighlight();
  }, [moveHighlight]);

  useEffect(() => {
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
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
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= VARIANTS.length) {
        selectVariant(number - 1);
      } else if (event.key === "ArrowRight") {
        selectVariant((activeIndex + 1) % VARIANTS.length);
      } else if (event.key === "ArrowLeft") {
        selectVariant((activeIndex - 1 + VARIANTS.length) % VARIANTS.length);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, selectVariant]);

  return (
    <div className="-m-4 flex min-h-0 flex-1 overflow-hidden">
      <div key={activeIndex} className="min-h-0 min-w-0 flex-1">
        <ActiveVariant />
      </div>

      <nav
        className="proto-picker"
        aria-label="Prototype variants"
        data-ready={ready ? "" : undefined}
      >
        <span
          ref={highlightRef}
          className="proto-picker-highlight"
          aria-hidden="true"
        />
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
              data-active={isActive ? "" : undefined}
              aria-current={isActive ? "true" : undefined}
              onClick={() => selectVariant(index)}
            >
              {variant.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
