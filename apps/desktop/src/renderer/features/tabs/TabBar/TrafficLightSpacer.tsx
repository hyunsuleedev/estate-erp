import { useEffect, useState } from 'react';

const isMac = window.electronBridge?.platform === 'darwin';

/**
 * macOS 트래픽 라이트 자리를 비워주는 좌측 스페이서.
 * 풀스크린 시 트래픽 라이트가 사라지므로 패딩을 줄임.
 */
export function TrafficLightSpacer() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isMac) return;
    window.electronBridge?.isFullscreen().then(setIsFullscreen);
    const cleanup = window.electronBridge?.onFullscreenChanged(setIsFullscreen);
    return cleanup;
  }, []);

  if (!isMac) return null;
  return <div className={isFullscreen ? 'w-2' : 'w-[78px]'} aria-hidden />;
}
