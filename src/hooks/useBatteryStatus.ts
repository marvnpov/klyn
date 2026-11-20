import { useEffect, useState } from 'react';
import { BatterySnapshot } from '../types/music';

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

const DEFAULT_SNAPSHOT: BatterySnapshot = {
  supported: false,
  level: null,
  charging: null,
  chargingTime: null,
  dischargingTime: null,
  updatedAt: 0,
};

function mapBatteryManager(mgr: BatteryManagerLike): BatterySnapshot {
  const pct = Number.isFinite(mgr.level) ? Math.round(Math.min(1, Math.max(0, mgr.level)) * 100) : null;
  return {
    supported: true,
    level: pct,
    charging: Boolean(mgr.charging),
    chargingTime: Number.isFinite(mgr.chargingTime) ? mgr.chargingTime : null,
    dischargingTime: Number.isFinite(mgr.dischargingTime) ? mgr.dischargingTime : null,
    updatedAt: Date.now(),
  };
}

export function useBatteryStatus(): BatterySnapshot {
  const [battery, setBattery] = useState<BatterySnapshot>(DEFAULT_SNAPSHOT);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    let active = true;
    let manager: BatteryManagerLike | null = null;

    const update = () => {
      if (!active || !manager) return;
      setBattery(mapBatteryManager(manager));
    };

    nav
      .getBattery()
      .then((mgr) => {
        if (!active) return;
        manager = mgr;
        setBattery(mapBatteryManager(mgr));
        mgr.addEventListener('levelchange', update);
        mgr.addEventListener('chargingchange', update);
        mgr.addEventListener('chargingtimechange', update);
        mgr.addEventListener('dischargingtimechange', update);
      })
      .catch(() => {
        // Battery Status API unavailable or blocked in restricted iframe
      });

    const intervalId = window.setInterval(update, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (manager) {
        try {
          manager.removeEventListener('levelchange', update);
          manager.removeEventListener('chargingchange', update);
          manager.removeEventListener('chargingtimechange', update);
          manager.removeEventListener('dischargingtimechange', update);
        } catch {
          // ignore cleanup failures
        }
      }
    };
  }, []);

  return battery;
}
