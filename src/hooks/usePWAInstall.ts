import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PWAInstallOutcome = 'installed' | 'dismissed' | 'unavailable';

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled = false;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  }
}

function checkStandaloneInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

// Capture beforeinstallprompt & appinstalled immediately on app startup so Settings never misses it
if (typeof window !== 'undefined') {
  globalIsInstalled = checkStandaloneInstalled();
  try {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      notifySubscribers();
    });
    window.addEventListener('appinstalled', () => {
      globalIsInstalled = true;
      globalDeferredPrompt = null;
      notifySubscribers();
    });
  } catch {
    // Ignore in restricted frames
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(
    () => globalIsInstalled || checkStandaloneInstalled(),
  );

  useEffect(() => {
    const sync = () => {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstalled(globalIsInstalled || checkStandaloneInstalled());
    };
    sync();
    subscribers.add(sync);
    return () => {
      subscribers.delete(sync);
    };
  }, []);

  const install = useCallback(async (): Promise<PWAInstallOutcome> => {
    if (isInstalled) return 'installed';
    const promptEvent = globalDeferredPrompt ?? deferredPrompt;
    if (!promptEvent) return 'unavailable';

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        globalIsInstalled = true;
        setIsInstalled(true);
        notifySubscribers();
        return 'installed';
      }
      notifySubscribers();
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt, isInstalled]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    install,
  };
}
