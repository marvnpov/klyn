import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OUTPUT_DEVICE } from '../data/catalog';
import { AudioDevice } from '../types/music';

interface BluetoothRemoteGATTServerLike {
  connected?: boolean;
  connect?: () => Promise<BluetoothRemoteGATTServerLike>;
  disconnect?: () => void;
}

interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
  addEventListener?: (type: string, listener: () => void) => void;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    }) => Promise<BluetoothDeviceLike>;
  };
}

const BLUETOOTH_DEVICES_STORAGE_KEY = 'klyn_bluetooth_devices_v1';

let cachedSystemOutputs: AudioDevice[] = [DEFAULT_OUTPUT_DEVICE];
let cachedBluetoothDevices: AudioDevice[] = [];
const liveBluetoothHandles = new Map<string, BluetoothDeviceLike>();
let isScanningGlobal = false;
let scanStatusGlobal: string | null = null;
let deviceChangeAttached = false;
const deviceSubscribers = new Set<() => void>();

function notifyDeviceSubscribers() {
  for (const cb of deviceSubscribers) {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  }
}

function loadStoredBluetoothDevices(): AudioDevice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(BLUETOOTH_DEVICES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AudioDevice[];
    return Array.isArray(parsed)
      ? parsed.filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveStoredBluetoothDevices(list: AudioDevice[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(BLUETOOTH_DEVICES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage failures
  }
}

if (typeof window !== 'undefined') {
  cachedBluetoothDevices = loadStoredBluetoothDevices();
}

function inferOutputType(label: string): AudioDevice['type'] {
  const lower = label.toLowerCase();
  if (
    lower.includes('headphone') ||
    lower.includes('airpods') ||
    lower.includes('buds') ||
    lower.includes('ear') ||
    lower.includes('headset')
  ) {
    return 'headphones';
  }
  if (lower.includes('bluetooth') || lower.includes('bt ')) {
    return 'bluetooth';
  }
  if (lower.includes('speaker') || lower.includes('hdmi') || lower.includes('monitor')) {
    return 'speaker';
  }
  return 'desktop';
}

async function refreshSystemAudioOutputsInternal(): Promise<AudioDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    cachedSystemOutputs = [DEFAULT_OUTPUT_DEVICE];
    notifyDeviceSubscribers();
    return cachedSystemOutputs;
  }

  try {
    const allMediaDevices = await navigator.mediaDevices.enumerateDevices();
    const outputs = allMediaDevices.filter((d) => d.kind === 'audiooutput');
    const nextList: AudioDevice[] = [DEFAULT_OUTPUT_DEVICE];
    const seenIds = new Set<string>(['default', '']);

    outputs.forEach((out, idx) => {
      if (!out.deviceId || seenIds.has(out.deviceId)) return;
      seenIds.add(out.deviceId);
      const label = out.label?.trim() || `Audio Output ${idx + 1}`;
      nextList.push({
        id: `audiooutput:${out.deviceId}`,
        name: label,
        type: inferOutputType(label),
        detail: 'System Audio Output',
        source: 'audiooutput',
        sinkId: out.deviceId,
        connected: true,
      });
    });

    cachedSystemOutputs = nextList;
  } catch {
    cachedSystemOutputs = [DEFAULT_OUTPUT_DEVICE];
  }

  notifyDeviceSubscribers();
  return cachedSystemOutputs;
}

function getCombinedDevices(): AudioDevice[] {
  const map = new Map<string, AudioDevice>();
  for (const d of cachedSystemOutputs) map.set(d.id, d);
  for (const d of cachedBluetoothDevices) map.set(d.id, d);
  return Array.from(map.values());
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>(() => getCombinedDevices());
  const [isScanningBluetooth, setIsScanningBluetooth] = useState<boolean>(isScanningGlobal);
  const [scanStatus, setScanStatus] = useState<string | null>(scanStatusGlobal);

  const bluetoothSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as NavigatorWithBluetooth).bluetooth?.requestDevice);

  useEffect(() => {
    const sync = () => {
      setDevices(getCombinedDevices());
      setIsScanningBluetooth(isScanningGlobal);
      setScanStatus(scanStatusGlobal);
    };

    deviceSubscribers.add(sync);
    void refreshSystemAudioOutputsInternal();

    if (
      !deviceChangeAttached &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.addEventListener
    ) {
      deviceChangeAttached = true;
      try {
        navigator.mediaDevices.addEventListener('devicechange', () => {
          void refreshSystemAudioOutputsInternal();
        });
      } catch {
        // Ignore in restricted frames
      }
    }

    return () => {
      deviceSubscribers.delete(sync);
    };
  }, []);

  const refreshAudioOutputs = useCallback(async () => {
    await refreshSystemAudioOutputsInternal();
  }, []);

  const scanBluetoothDevices = useCallback(async (): Promise<AudioDevice | null> => {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBluetooth) : null;
    if (!nav?.bluetooth?.requestDevice) {
      scanStatusGlobal = 'Bluetooth scanning requires Chrome or Edge over HTTPS.';
      notifyDeviceSubscribers();
      return null;
    }

    isScanningGlobal = true;
    scanStatusGlobal = 'Scanning for nearby Bluetooth devices...';
    notifyDeviceSubscribers();

    try {
      let btDevice: BluetoothDeviceLike;
      try {
        btDevice = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['battery_service', 'device_information', 'generic_access'],
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotFoundError' || name === 'AbortError' || name === 'SecurityError') {
          throw err;
        }
        btDevice = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
        });
      }

      let connected = false;
      if (btDevice.gatt?.connect) {
        try {
          const server = await btDevice.gatt.connect();
          connected = Boolean(server?.connected ?? true);
        } catch {
          connected = false;
        }
      }

      const deviceId = `bt:${btDevice.id}`;
      const deviceName = btDevice.name?.trim() || 'Bluetooth Audio Device';
      const entry: AudioDevice = {
        id: deviceId,
        name: deviceName,
        type: 'bluetooth',
        detail: connected ? 'Bluetooth · Connected' : 'Bluetooth · Paired',
        source: 'bluetooth',
        bluetoothId: btDevice.id,
        connected,
      };

      liveBluetoothHandles.set(deviceId, btDevice);

      try {
        btDevice.addEventListener?.('gattserverdisconnected', () => {
          cachedBluetoothDevices = cachedBluetoothDevices.map((d) =>
            d.id === deviceId ? { ...d, connected: false, detail: 'Bluetooth · Paired' } : d,
          );
          saveStoredBluetoothDevices(cachedBluetoothDevices);
          notifyDeviceSubscribers();
        });
      } catch {
        // Ignore listener errors
      }

      cachedBluetoothDevices = [
        entry,
        ...cachedBluetoothDevices.filter((d) => d.id !== deviceId),
      ];
      saveStoredBluetoothDevices(cachedBluetoothDevices);
      scanStatusGlobal = connected
        ? `Connected to ${deviceName}`
        : `Paired ${deviceName}`;
      return entry;
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotFoundError' || errName === 'AbortError') {
        scanStatusGlobal = 'No Bluetooth device selected.';
      } else if (errName === 'SecurityError') {
        scanStatusGlobal = 'Bluetooth scanning is blocked in this preview frame.';
      } else {
        scanStatusGlobal = 'Unable to scan for Bluetooth devices right now.';
      }
      return null;
    } finally {
      isScanningGlobal = false;
      notifyDeviceSubscribers();
    }
  }, []);

  const removeBluetoothDevice = useCallback((deviceId: string) => {
    const handle = liveBluetoothHandles.get(deviceId);
    try {
      handle?.gatt?.disconnect?.();
    } catch {
      // ignore disconnect errors
    }
    liveBluetoothHandles.delete(deviceId);
    cachedBluetoothDevices = cachedBluetoothDevices.filter((d) => d.id !== deviceId);
    saveStoredBluetoothDevices(cachedBluetoothDevices);
    notifyDeviceSubscribers();
  }, []);

  return {
    devices,
    bluetoothSupported,
    isScanningBluetooth,
    scanStatus,
    scanBluetoothDevices,
    refreshAudioOutputs,
    removeBluetoothDevice,
  };
}
