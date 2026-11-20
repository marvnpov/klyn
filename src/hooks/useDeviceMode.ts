import { useEffect, useState } from 'react';

export type DeviceLayoutMode = 'desktop' | 'mobile';
export type LayoutPreference = 'auto' | 'desktop' | 'mobile';

function detectViewportMode(): DeviceLayoutMode {
  if (typeof window === 'undefined') return 'mobile';
  const wide = window.innerWidth >= 1024;
  const finePointer =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: fine)').matches
      : true;
  return wide && finePointer ? 'desktop' : 'mobile';
}

export function useDeviceMode(preference: LayoutPreference = 'auto') {
  const [detectedMode, setDetectedMode] = useState<DeviceLayoutMode>(() =>
    detectViewportMode(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setDetectedMode(detectViewportMode());
    };
    update();
    window.addEventListener('resize', update);
    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: fine)')
        : null;
    mq?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);

  const mode: DeviceLayoutMode =
    preference === 'desktop'
      ? 'desktop'
      : preference === 'mobile'
        ? 'mobile'
        : detectedMode;

  return {
    mode,
    detectedMode,
    isDesktop: mode === 'desktop',
    isMobile: mode === 'mobile',
  };
}
