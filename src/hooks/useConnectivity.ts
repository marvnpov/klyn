import { useEffect, useRef, useState } from 'react';

export interface ConnectivityState {
  isOnline: boolean;
  showOnlineRestoredBanner: boolean;
}

export function useConnectivity(): ConnectivityState {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [showOnlineRestoredBanner, setShowOnlineRestoredBanner] = useState<boolean>(false);
  const wasOfflineRef = useRef<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const restoreTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const triggerRestoredBanner = () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
      }
      setShowOnlineRestoredBanner(true);
      restoreTimerRef.current = window.setTimeout(() => {
        setShowOnlineRestoredBanner(false);
        restoreTimerRef.current = null;
      }, 2500);
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        triggerRestoredBanner();
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      setShowOnlineRestoredBanner(false);
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    };
  }, []);

  return {
    isOnline,
    showOnlineRestoredBanner,
  };
}
