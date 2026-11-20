import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OUTPUT_DEVICE } from '../data/catalog';
import { AudioDevice, BluetoothConnectionState } from '../types/music';

interface BluetoothRemoteGATTCharacteristicLike {
  value?: DataView;
  readValue?: () => Promise<DataView>;
  startNotifications?: () => Promise<BluetoothRemoteGATTCharacteristicLike>;
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
}

interface BluetoothRemoteGATTServiceLike {
  getCharacteristic?: (uuid: string | number) => Promise<BluetoothRemoteGATTCharacteristicLike>;
}

interface BluetoothRemoteGATTServerLike {
  connected?: boolean;
  connect?: () => Promise<BluetoothRemoteGATTServerLike>;
  disconnect?: () => void;
  getPrimaryService?: (uuid: string | number) => Promise<BluetoothRemoteGATTServiceLike>;
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

const BLUETOOTH_DEVICES_STORAGE_KEY = 'klyn_bluetooth_devices_v2';

let cachedSystemOutputs: AudioDevice[] = [DEFAULT_OUTPUT_DEVICE];
let cachedBluetoothDevices: AudioDevice[] = [];
const liveBluetoothHandles = new Map<string, BluetoothDeviceLike>();
const liveBatteryCharacteristics = new Map<string, BluetoothRemoteGATTCharacteristicLike>();
let bluetoothStateGlobal: BluetoothConnectionState = 'idle';
let scanStatusGlobal: string | null = null;
let deviceChangeAttached = false;
let batteryPollTimer: number | null = null;
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

function updateDeviceBatteryLevel(deviceId: string, level: number | null): void {
  let changed = false;
  cachedBluetoothDevices = cachedBluetoothDevices.map((d) => {
    if (d.id !== deviceId) return d;
    changed = true;
    const batteryLabel = typeof level === 'number' ? ` · ${level}% battery` : '';
    return {
      ...d,
      batteryLevel: level,
      detail: `${d.connected ? 'Bluetooth · Connected' : 'Bluetooth · Paired'}${batteryLabel}`,
    };
  });
  if (changed) {
    saveStoredBluetoothDevices(cachedBluetoothDevices);
    notifyDeviceSubscribers();
  }
}

async function readBluetoothBatteryGatt(
  deviceId: string,
  server: BluetoothRemoteGATTServerLike,
): Promise<number | null> {
  if (!server?.getPrimaryService) return null;
  try {
    const batteryService = await server.getPrimaryService('battery_service');
    const char = await batteryService.getCharacteristic?.('battery_level');
    if (!char) return null;

    liveBatteryCharacteristics.set(deviceId, char);

    if (char.readValue) {
      const valueView = await char.readValue();
      const level = valueView.getUint8(0);
      if (Number.isFinite(level) && level >= 0 && level <= 100) {
        updateDeviceBatteryLevel(deviceId, level);
      }
      if (char.startNotifications && char.addEventListener) {
        try {
          await char.startNotifications();
          char.addEventListener('characteristicvaluechanged', () => {
            const v = char.value?.getUint8(0);
            if (typeof v === 'number' && v >= 0 && v <= 100) {
              updateDeviceBatteryLevel(deviceId, v);
            }
          });
        } catch {
          // Device does not support notifications; periodic poll handles updates
        }
      }
      return level;
    }
  } catch {
    // Peripheral does not expose Battery Service (0x180F)
  }
  return null;
}

function ensureBatteryPollLoop(): void {
  if (typeof window === 'undefined' || batteryPollTimer !== null) return;
  batteryPollTimer = window.setInterval(() => {
    if (liveBatteryCharacteristics.size === 0) return;
    liveBatteryCharacteristics.forEach((char, deviceId) => {
      if (!char.readValue) return;
      void char
        .readValue()
        .then((view) => {
          const pct = view.getUint8(0);
          if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
            updateDeviceBatteryLevel(deviceId, pct);
          }
        })
        .catch(() => {
          // Ignore transient GATT read errors
        });
    });
  }, 45000);
}

function computeAggregateBluetoothState(): BluetoothConnectionState {
  if (bluetoothStateGlobal === 'scanning' || bluetoothStateGlobal === 'connecting') {
    return bluetoothStateGlobal;
  }
  return cachedBluetoothDevices.some((d) => d.connected) ? 'connected' : 'idle';
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
  const [bluetoothState, setBluetoothState] = useState<BluetoothConnectionState>(() =>
    computeAggregateBluetoothState(),
  );
  const [scanStatus, setScanStatus] = useState<string | null>(scanStatusGlobal);

  const bluetoothSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as NavigatorWithBluetooth).bluetooth?.requestDevice);

  useEffect(() => {
    const sync = () => {
      setDevices(getCombinedDevices());
      setBluetoothState(computeAggregateBluetoothState());
      setScanStatus(scanStatusGlobal);
    };

    deviceSubscribers.add(sync);
    void refreshSystemAudioOutputsInternal();
    ensureBatteryPollLoop();

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

    bluetoothStateGlobal = 'scanning';
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

      bluetoothStateGlobal = 'connecting';
      scanStatusGlobal = `Connecting to ${btDevice.name?.trim() || 'Bluetooth device'}...`;
      notifyDeviceSubscribers();

      const deviceId = `bt:${btDevice.id}`;
      const deviceName = btDevice.name?.trim() || 'Bluetooth Audio Device';
      let connected = false;
      let batteryLevel: number | null = null;

      if (btDevice.gatt?.connect) {
        try {
          const server = await btDevice.gatt.connect();
          connected = Boolean(server?.connected ?? true);
          if (connected) {
            batteryLevel = await readBluetoothBatteryGatt(deviceId, server);
          }
        } catch {
          connected = false;
        }
      }

      const batteryLabel = typeof batteryLevel === 'number' ? ` · ${batteryLevel}% battery` : '';
      const entry: AudioDevice = {
        id: deviceId,
        name: deviceName,
        type: 'bluetooth',
        detail: `${connected ? 'Bluetooth · Connected' : 'Bluetooth · Paired'}${batteryLabel}`,
        source: 'bluetooth',
        bluetoothId: btDevice.id,
        connected,
        batteryLevel,
      };

      liveBluetoothHandles.set(deviceId, btDevice);

      try {
        btDevice.addEventListener?.('gattserverdisconnected', () => {
          liveBatteryCharacteristics.delete(deviceId);
          cachedBluetoothDevices = cachedBluetoothDevices.map((d) =>
            d.id === deviceId ? { ...d, connected: false, detail: 'Bluetooth · Paired' } : d,
          );
          saveStoredBluetoothDevices(cachedBluetoothDevices);
          bluetoothStateGlobal = computeAggregateBluetoothState();
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
      bluetoothStateGlobal = connected ? 'connected' : 'idle';
      scanStatusGlobal = connected
        ? `Connected to ${deviceName}${batteryLabel}`
        : `Paired ${deviceName}`;
      return entry;
    } catch (err) {
      bluetoothStateGlobal = computeAggregateBluetoothState();
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
      if (bluetoothStateGlobal === 'scanning' || bluetoothStateGlobal === 'connecting') {
        bluetoothStateGlobal = computeAggregateBluetoothState();
      }
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
    liveBatteryCharacteristics.delete(deviceId);
    cachedBluetoothDevices = cachedBluetoothDevices.filter((d) => d.id !== deviceId);
    saveStoredBluetoothDevices(cachedBluetoothDevices);
    bluetoothStateGlobal = computeAggregateBluetoothState();
    notifyDeviceSubscribers();
  }, []);

  const connectedBluetoothDevice =
    devices.find((d) => d.source === 'bluetooth' && d.connected) ?? null;

  return {
    devices,
    bluetoothSupported,
    bluetoothState,
    isScanningBluetooth: bluetoothState === 'scanning' || bluetoothState === 'connecting',
    connectedBluetoothDevice,
    scanStatus,
    scanBluetoothDevices,
    refreshAudioOutputs,
    removeBluetoothDevice,
  };
}
