import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FilterCanvasVariant } from "./variants/FilterCanvasVariant.jsx";
import { QuickRailVariant } from "./variants/QuickRailVariant.jsx";
import { SavedLensesVariant } from "./variants/SavedLensesVariant.jsx";

const variants = [
  { name: "Quick Rail", component: QuickRailVariant },
  { name: "Filter Canvas", component: FilterCanvasVariant },
  { name: "Saved Lenses", component: SavedLensesVariant },
];

function getInitialVariantIndex() {
  const candidate = Number.parseInt(new URLSearchParams(window.location.search).get("v"), 10) - 1;
  return Number.isInteger(candidate) && candidate >= 0 && candidate < variants.length ? candidate : 0;
}

export function App() {
  const [current, setCurrent] = useState(getInitialVariantIndex);
  const [mountKey, setMountKey] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const pickerRef = useRef(null);
  const itemRefs = useRef([]);
  const highlightRef = useRef(null);

  const moveHighlight = useCallback(() => {
    const item = itemRefs.current[current];
    const highlight = highlightRef.current;
    if (!item || !highlight) return;
    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [current]);

  const setActive = useCallback((index) => {
    if (index < 0 || index >= variants.length) return;
    setCurrent(index);
    setMountKey((key) => key + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  useLayoutEffect(() => {
    moveHighlight();
  }, [moveHighlight]);

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => setIsReady(true));
      return () => window.cancelAnimationFrame(secondFrame);
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(moveHighlight);
    if (pickerRef.current) resizeObserver.observe(pickerRef.current);
    window.addEventListener("resize", moveHighlight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", moveHighlight);
    };
  }, [moveHighlight]);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      if (
        /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) ||
        target?.isContentEditable ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= variants.length) {
        setActive(number - 1);
      } else if (event.key === "ArrowRight") {
        setActive((current + 1) % variants.length);
      } else if (event.key === "ArrowLeft") {
        setActive((current - 1 + variants.length) % variants.length);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [current, setActive]);

  const Variant = variants[current].component;

  return (
    <>
      <div id="stage">
        <Variant key={`${current}-${mountKey}`} />
      </div>

      <nav
        ref={pickerRef}
        className="proto-picker"
        aria-label="Prototype variants"
        {...(isReady ? { "data-ready": "" } : {})}
      >
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true"></span>
        {variants.map((variant, index) => (
          <button
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            type="button"
            className="proto-picker-item"
            key={variant.name}
            onClick={() => setActive(index)}
            {...(current === index
              ? { "data-active": "", "aria-current": "true" }
              : {})}
          >
            {variant.name}
          </button>
        ))}
      </nav>
    </>
  );
}
