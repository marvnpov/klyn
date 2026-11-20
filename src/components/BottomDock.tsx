import React, { useRef, useState } from 'react';
import {
  BarChart2,
  Bluetooth,
  Clapperboard,
  Home,
  Library,
  Pause,
  Play,
  Search,
  SkipForward,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AudioDevice, BluetoothConnectionState, NavTab, Track } from '../types/music';
import { CoverArt } from './CoverArt';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';

interface BottomDockProps {
  activeTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  activeNav: NavTab;
  isOnline: boolean;
  showOnlineRestoredBanner: boolean;
  bluetoothState: BluetoothConnectionState;
  connectedBluetoothDevice: AudioDevice | null;
  onNavChange: (nav: NavTab) => void;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onOpenPlayer: () => void;
  onOpenDevicesSettings?: () => void;
  onDismissMiniPlayer?: () => void;
}

const NAV_ITEMS: PillTabItem<NavTab>[] = [
  { id: 'Home', label: 'Home', icon: <Home className="h-[18px] w-[18px]" strokeWidth={1.85} /> },
  { id: 'Reels', label: 'Reels', icon: <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.85} /> },
  { id: 'Search', label: 'Search', icon: <Search className="h-[18px] w-[18px]" strokeWidth={1.85} /> },
  { id: 'Activity', label: 'Activity', icon: <BarChart2 className="h-[18px] w-[18px]" strokeWidth={1.85} /> },
  { id: 'Library', label: 'Library', icon: <Library className="h-[18px] w-[18px]" strokeWidth={1.85} /> },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeTrack,
  isPlaying,
  currentTime,
  activeNav,
  isOnline,
  showOnlineRestoredBanner,
  bluetoothState,
  connectedBluetoothDevice,
  onNavChange,
  onTogglePlay,
  onNextTrack,
  onOpenPlayer,
  onOpenDevicesSettings,
  onDismissMiniPlayer,
}) => {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeDismissedRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const progressPct = activeTrack
    ? Math.min(100, Math.max(0, (currentTime / Math.max(activeTrack.duration, 1)) * 100))
    : 0;

  const showConnectivityPill = !isOnline || showOnlineRestoredBanner;
  const showBluetoothPill = bluetoothState !== 'idle' || Boolean(connectedBluetoothDevice);

  const handleMiniPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    swipeDismissedRef.current = false;
  };

  const handleMiniPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeStartRef.current) return;
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = Math.max(0, e.clientY - swipeStartRef.current.y);
    if (Math.abs(dx) > 6 || dy > 6) {
      setSwipeOffset({ x: dx * 0.7, y: Math.min(54, dy * 0.65) });
    }
  };

  const handleMiniPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeStartRef.current) return;
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    setSwipeOffset({ x: 0, y: 0 });

    if (onDismissMiniPlayer && (Math.abs(dx) > 64 || dy > 44)) {
      swipeDismissedRef.current = true;
      onDismissMiniPlayer();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 sm:px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-5">
      {/* Spotify-Style Auto-Hiding Connectivity Status Bar */}
      {showConnectivityPill && (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-2xl transition-all duration-300 ${
            !isOnline
              ? 'bg-zinc-950/95 text-white/90 border border-white/14 backdrop-blur-2xl'
              : 'bg-emerald-500 text-black shadow-[0_8px_28px_rgba(16,185,129,0.45)]'
          }`}
        >
          {!isOnline ? (
            <>
              <WifiOff className="h-3.5 w-3.5 text-white/75" />
              <span>No internet connection • Offline mode</span>
            </>
          ) : (
            <>
              <Wifi className="h-3.5 w-3.5" />
              <span>Back online</span>
            </>
          )}
        </div>
      )}

      {/* Web Bluetooth Hardware Indicator Pill */}
      {showBluetoothPill && (
        <button
          type="button"
          onClick={onOpenDevicesSettings}
          className="pointer-events-auto liquid-glass flex items-center gap-2 rounded-full px-3.5 py-1 text-[11px] font-semibold text-white/90 transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Bluetooth
            className={`h-3 w-3 ${
              bluetoothState === 'connected'
                ? 'text-sky-400'
                : 'text-amber-300 animate-pulse'
            }`}
          />
          <span>
            {bluetoothState === 'scanning'
              ? 'Scanning Bluetooth…'
              : bluetoothState === 'connecting'
                ? 'Connecting Bluetooth…'
                : connectedBluetoothDevice
                  ? `${connectedBluetoothDevice.name}${
                      typeof connectedBluetoothDevice.batteryLevel === 'number'
                        ? ` · ${connectedBluetoothDevice.batteryLevel}%`
                        : ''
                    }`
                  : 'Bluetooth Connected'}
          </span>
        </button>
      )}

      {/* Top Layer: Floating Mini-Player Pill (Hidden when browsing Reels feed cleanly) */}
      {activeTrack && activeNav !== 'Reels' && (
        <div
          role="button"
          tabIndex={0}
          onPointerDown={handleMiniPointerDown}
          onPointerMove={handleMiniPointerMove}
          onPointerUp={handleMiniPointerEnd}
          onPointerCancel={handleMiniPointerEnd}
          onClick={() => {
            if (swipeDismissedRef.current) {
              swipeDismissedRef.current = false;
              return;
            }
            onOpenPlayer();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenPlayer();
            }
          }}
          aria-label={`Open full player for ${activeTrack.title} by ${activeTrack.artist}`}
          className="pointer-events-auto liquid-glass-elevated relative w-full max-w-md cursor-pointer touch-pan-y select-none overflow-hidden rounded-full px-3 py-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={
            swipeOffset.x !== 0 || swipeOffset.y !== 0
              ? {
                  transform: `translate3d(${swipeOffset.x}px, ${swipeOffset.y}px, 0)`,
                  opacity: Math.max(0.35, 1 - Math.abs(swipeOffset.x) / 140 - swipeOffset.y / 90),
                }
              : undefined
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="relative h-10 w-10 shrink-0 rounded-full transition-shadow duration-500"
                style={{
                  boxShadow: isPlaying
                    ? `0 0 18px ${activeTrack.primaryColor}88`
                    : '0 2px 8px rgba(0, 0, 0, 0.5)',
                }}
              >
                <CoverArt
                  src={activeTrack.coverUrl}
                  alt={activeTrack.album}
                  fallbackGradient={activeTrack.fallbackGradient}
                  className="h-10 w-10 rounded-full"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-white">
                  {activeTrack.title}
                </p>
                <p className="truncate text-xs text-white/55 leading-tight mt-0.5">
                  {activeTrack.artist}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay();
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-150 hover:bg-white/10 active:scale-90 focus-visible:outline-none"
              >
                {isPlaying ? (
                  <Pause className="h-4.5 w-4.5 fill-white" />
                ) : (
                  <Play className="h-4.5 w-4.5 fill-white translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextTrack();
                }}
                aria-label="Next track"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-transform duration-150 hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none"
              >
                <SkipForward className="h-4.5 w-4.5 fill-current" />
              </button>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full bg-white/90"
              style={{
                width: `${progressPct}%`,
                transition: 'width 0.25s linear',
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom Layer: Floating Navigation Pill Bar (Home, Reels, Search, Activity, Library) */}
      <nav className="pointer-events-auto w-full max-w-lg" aria-label="Primary navigation">
        <SpringPillTabs
          items={NAV_ITEMS}
          activeId={activeNav}
          onChange={onNavChange}
          variant="equal"
          size="nav"
          ariaLabel="Main sections"
          className="liquid-glass-elevated p-1.5"
        />
      </nav>
    </div>
  );
};
