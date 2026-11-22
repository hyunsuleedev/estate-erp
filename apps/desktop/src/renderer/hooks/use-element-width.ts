import { useEffect, useState } from 'react';

/**
 * 요소의 너비를 따라간다. 화면이 넓을 때만 옆 열을 두는 상세 화면(프로젝트 · 연락처)이 쓴다.
 * 돌려주는 첫 값을 ref로 달면 된다. 재기 전의 너비는 0이다.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}
