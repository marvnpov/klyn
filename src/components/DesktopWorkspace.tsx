import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Airplay,
  Bluetooth,
  Check,
  Download,
  ExternalLink,
  Film,
  Headphones,
  Heart,
  Home,
  Library,
  ListMusic,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Plus,
  Quote,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Speaker,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAudioDevices } from '../hooks/useAudioDevices';
import {
  NavTab,
  PlaylistItem,
  RepeatMode,
  ShuffleMode,
  Track,
  UserAccount,
} from '../types/music';
import { CoverArt } from './CoverArt';
import { ExpandingScrubber } from './ExpandingScrubber';
import { KlynLogo } from './KlynLogo';
import { UserAvatar } from './UserAvatar';

type RightPanelMode = 'none' | 'queue' | 'lyrics' | 'devices';

interface DesktopWorkspaceProps {
  currentUser: UserAccount;
  activeNav: NavTab;
  onNavChange: (nav: NavTab) => void;
  playlists: PlaylistItem[];
  tracks: Track[];
  queue: Track[];
  activeTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  shuffleMode: ShuffleMode;
  repeatMode: RepeatMode;
  autoScrollLyrics: boolean;
  isFavorite: boolean;
  isDownloaded: boolean;
  activeDeviceId: string;
  isOnline: boolean;
  showOnlineRestoredBanner: boolean;
  mainScrollRef: React.RefObject<HTMLElement | null>;
  onOpenProfile: () => void;
  onOpenCreatePlaylist: () => void;
  onPlayTrack: (track: Track, queueList?: Track[], startAtTime?: number, openFullPlayer?: boolean) => void;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeek: (time: number) => void;
  onCycleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleDownload: (track: Track) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onOpenArtist: (artistName: string) => void;
  onOpenFullPlayer: () => void;
  onSelectDevice: (deviceId: string) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; Icon: React.FC<{ className?: string }> }> = [
  { id: 'Home', label: 'Home', Icon: Home },
  { id: 'Reels', label: 'Reels', Icon: Film },
  { id: 'Search', label: 'Search', Icon: Search },
  { id: 'Activity', label: 'Activity', Icon: Activity },
  { id: 'Library', label: 'Library', Icon: Library },
];

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({
  currentUser,
  activeNav,
  onNavChange,
  playlists,
  tracks,
  queue,
  activeTrack,
  isPlaying,
  currentTime,
  shuffleMode,
  repeatMode,
  autoScrollLyrics,
  isFavorite,
  isDownloaded,
  activeDeviceId,
  isOnline,
  showOnlineRestoredBanner,
  mainScrollRef,
  onOpenProfile,
  onOpenCreatePlaylist,
  onPlayTrack,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onSeek,
  onCycleShuffle,
  onCycleRepeat,
  onToggleFavorite,
  onToggleDownload,
  onOpenAddToPlaylist,
  onOpenArtist,
  onOpenFullPlayer,
  onSelectDevice,
  children,
}) => {
  const [rightPanel, setRightPanel] = useState<RightPanelMode>('none');
  const {
    devices,
    bluetoothSupported,
    isScanningBluetooth,
    connectedBluetoothDevice,
    scanStatus,
    scanBluetoothDevices,
    refreshAudioOutputs,
  } = useAudioDevices();

  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const lyricLineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastScrolledLyricIdx = useRef<number>(-1);

  const hasSyncedLyrics = useMemo(
    () => Boolean(activeTrack?.lyrics.some((line) => line.time >= 0)),
    [activeTrack?.lyrics],
  );

  const activeLyricIdx = useMemo(() => {
    if (!activeTrack || !hasSyncedLyrics || activeTrack.lyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < activeTrack.lyrics.length; i++) {
      if (activeTrack.lyrics[i].time <= currentTime + 0.15) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [activeTrack, hasSyncedLyrics, currentTime]);

  useEffect(() => {
    lastScrolledLyricIdx.current = -1;
    lyricLineRefs.current = [];
    if (lyricsScrollRef.current) {
      lyricsScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTrack?.id]);

  useEffect(() => {
    if (
      rightPanel !== 'lyrics' ||
      !autoScrollLyrics ||
      !hasSyncedLyrics ||
      activeLyricIdx < 0 ||
      activeLyricIdx === lastScrolledLyricIdx.current
    ) {
      return;
    }
    lastScrolledLyricIdx.current = activeLyricIdx;
    const container = lyricsScrollRef.current;
    const el = lyricLineRefs.current[activeLyricIdx];
    if (container && el) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetTop =
        container.scrollTop +
        (elRect.top - containerRect.top) -
        container.clientHeight / 2 +
        el.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }, [rightPanel, activeLyricIdx, autoScrollLyrics, hasSyncedLyrics]);

  const toggleRightPanel = (panel: Exclude<RightPanelMode, 'none'>) => {
    setRightPanel((cur) => (cur === panel ? 'none' : panel));
  };

  const googleLyricsHref = useMemo(() => {
    if (!activeTrack) return 'https://www.google.com';
    return `https://www.google.com/search?q=${encodeURIComponent(
      `${activeTrack.title} ${activeTrack.artist} lyrics`,
    )}`;
  }, [activeTrack]);

  return (
    <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-transparent text-white">
      {/* Upper 3-Zone Workspace: Left Sidebar + Center Viewport + Optional Right Panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Navigation & Playlists Sidebar */}
        <aside className="flex w-60 xl:w-64 shrink-0 flex-col border-r border-white/[0.08] bg-black/75 backdrop-blur-2xl">
          {/* Brand + User Pill */}
          <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-4">
            <button
              type="button"
              onClick={() => onNavChange('Home')}
              className="flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Go to Home"
            >
              <KlynLogo size={30} withWordmark />
            </button>
          </div>

          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.1]"
            >
              <UserAvatar
                name={currentUser.name}
                initials={currentUser.initials}
                avatarUrl={currentUser.avatarUrl}
                avatarStyle={currentUser.avatarStyle}
                accentColor={currentUser.accentColor}
                sizeClass="h-8 w-8"
                textClass="text-[11px]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{currentUser.name}</p>
                <p className="truncate text-[10px] text-white/50">{currentUser.handle}</p>
              </div>
            </button>
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Primary navigation" className="px-3 space-y-1">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const isActive = activeNav === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavChange(id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Playlists Section */}
          <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-white/[0.08] px-3 pt-4 pb-3">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                Playlists
              </span>
              <button
                type="button"
                onClick={onOpenCreatePlaylist}
                aria-label="Create playlist"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/75 hover:bg-white/20 hover:text-white transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="glass-scroll flex-1 space-y-1 overflow-y-auto pr-1">
              {playlists.length === 0 ? (
                <button
                  type="button"
                  onClick={onOpenCreatePlaylist}
                  className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-3 py-3 text-left text-xs text-white/55 hover:border-white/30 hover:text-white/80 transition-colors"
                >
                  Create your first playlist
                </button>
              ) : (
                playlists.map((pl) => {
                  const plTracks = tracks.filter((t) => pl.trackIds.includes(t.id));
                  const first = plTracks[0] ?? tracks[0];
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        if (first) {
                          onPlayTrack(first, plTracks.length > 0 ? plTracks : tracks, 0, false);
                        } else {
                          onNavChange('Library');
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
                    >
                      {pl.coverUrl || first?.coverUrl ? (
                        <CoverArt
                          src={pl.coverUrl || first?.coverUrl || ''}
                          alt={pl.title}
                          fallbackGradient={first?.fallbackGradient}
                          className="h-9 w-9 shrink-0 rounded-lg"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/60">
                          <ListMusic className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">{pl.title}</p>
                        <p className="truncate text-[10px] text-white/50">
                          {pl.trackIds.length} tracks
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Central Scrollable Content Area */}
        <main
          ref={mainScrollRef}
          className="glass-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <div className="mx-auto w-full max-w-[1600px] px-6 xl:px-8 py-6 pb-10">
            {children}
          </div>
        </main>

        {/* Optional Collapsible Right Inspector Panel (Queue / Lyrics / Devices) */}
        {rightPanel !== 'none' && (
          <aside className="flex w-80 xl:w-96 shrink-0 flex-col border-l border-white/[0.08] bg-black/80 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3.5">
              <div className="flex items-center gap-1.5">
                {(['queue', 'lyrics', 'devices'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setRightPanel(tab)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      rightPanel === tab
                        ? 'bg-white text-black'
                        : 'bg-white/[0.07] text-white/65 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRightPanel('none')}
                aria-label="Close panel"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {rightPanel === 'queue' && (
              <div className="glass-scroll flex-1 overflow-y-auto p-4 space-y-4">
                {activeTrack && (
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                      Now Playing
                    </p>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.07] p-2.5">
                      <CoverArt
                        src={activeTrack.coverUrl}
                        alt={activeTrack.title}
                        fallbackGradient={activeTrack.fallbackGradient}
                        className="h-11 w-11 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{activeTrack.title}</p>
                        <p className="truncate text-[11px] text-white/60">{activeTrack.artist}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                    Up Next ({queue.length})
                  </p>
                  {queue.length === 0 ? (
                    <p className="text-xs text-white/45">Your queue is empty.</p>
                  ) : (
                    <div className="space-y-1">
                      {queue.map((item) => {
                        const isCurrent = item.id === activeTrack?.id;
                        return (
                          <button
                            key={`dq-${item.id}`}
                            type="button"
                            onClick={() => onPlayTrack(item, queue, 0, false)}
                            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                              isCurrent ? 'bg-white/12' : 'hover:bg-white/[0.06]'
                            }`}
                          >
                            <CoverArt
                              src={item.coverUrl}
                              alt={item.title}
                              fallbackGradient={item.fallbackGradient}
                              className="h-9 w-9 shrink-0 rounded-lg"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-white">
                                {item.title}
                              </p>
                              <p className="truncate text-[11px] text-white/55">{item.artist}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightPanel === 'lyrics' && (
              <div ref={lyricsScrollRef} className="glass-scroll flex-1 overflow-y-auto p-5">
                {!activeTrack ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Quote className="h-7 w-7 text-white/30" />
                    <p className="mt-2 text-xs text-white/50">Play a song to view synced lyrics.</p>
                  </div>
                ) : activeTrack.lyricsLoading && activeTrack.lyrics.length === 0 ? (
                  <div className="space-y-4 py-4">
                    {['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-4/5'].map((w, i) => (
                      <div key={i} className={`h-6 rounded-xl bg-white/[0.08] animate-pulse ${w}`} />
                    ))}
                  </div>
                ) : activeTrack.lyrics.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <Quote className="h-7 w-7 text-white/30" />
                    <p className="text-sm font-semibold text-white/85">
                      Synced lyrics unavailable for this track
                    </p>
                    <a
                      href={googleLyricsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
                    >
                      <span>Search on Google for full lyrics</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {activeTrack.lyrics.map((line, idx) => {
                      const isActive = hasSyncedLyrics && idx === activeLyricIdx;
                      return (
                        <button
                          key={`dl-${activeTrack.id}-${idx}`}
                          ref={(el) => {
                            lyricLineRefs.current[idx] = el;
                          }}
                          type="button"
                          disabled={line.time < 0}
                          onClick={() => {
                            if (line.time >= 0) onSeek(line.time);
                          }}
                          className={`block w-full text-left font-display transition-all duration-200 ${
                            !hasSyncedLyrics
                              ? 'text-base font-semibold text-white/80 cursor-default'
                              : isActive
                                ? 'text-lg font-bold text-white scale-[1.01] origin-left'
                                : 'text-base font-semibold text-white/30 hover:text-white/65'
                          }`}
                        >
                          {line.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {rightPanel === 'devices' && (
              <div className="glass-scroll flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void scanBluetoothDevices()}
                    disabled={!bluetoothSupported || isScanningBluetooth}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black transition-opacity disabled:opacity-50"
                  >
                    {isScanningBluetooth ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bluetooth className="h-3.5 w-3.5" />
                    )}
                    <span>{isScanningBluetooth ? 'Scanning...' : 'Scan Bluetooth'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshAudioOutputs()}
                    aria-label="Refresh outputs"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white/75 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {scanStatus && (
                  <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-[11px] text-white/65">
                    {scanStatus}
                  </p>
                )}

                <div className="space-y-1.5">
                  {devices.map((device) => {
                    const isSelected = device.id === activeDeviceId;
                    return (
                      <button
                        key={`dd-${device.id}`}
                        type="button"
                        onClick={() => onSelectDevice(device.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
                        }`}
                      >
                        {device.type === 'headphones' ? (
                          <Headphones className="h-4 w-4 shrink-0" />
                        ) : device.type === 'bluetooth' ? (
                          <Bluetooth className="h-4 w-4 shrink-0" />
                        ) : (
                          <Speaker className="h-4 w-4 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{device.name}</p>
                          <p
                            className={`truncate text-[10px] ${
                              isSelected ? 'text-black/65' : 'text-white/50'
                            }`}
                          >
                            {device.detail}
                          </p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Desktop Control Bar (NO Share button) */}
      <footer className="shrink-0 border-t border-white/[0.08] bg-black/90 backdrop-blur-2xl">
        {(!isOnline || showOnlineRestoredBanner) && (
          <div
            className={`flex items-center justify-center gap-2 py-1 text-[11px] font-semibold ${
              !isOnline ? 'bg-zinc-900 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Offline — Playing downloaded songs</span>
              </>
            ) : (
              <>
                <Wifi className="h-3 w-3" />
                <span>Back Online</span>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)] items-center gap-4 px-5 py-3">
          {/* Left: Active Track Metadata + Favorite / Download / Playlist */}
          <div className="flex min-w-0 items-center gap-3">
            {activeTrack ? (
              <>
                <button
                  type="button"
                  onClick={onOpenFullPlayer}
                  aria-label="Open full-screen player"
                  className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-xl"
                >
                  <CoverArt
                    src={activeTrack.coverUrl}
                    alt={activeTrack.title}
                    fallbackGradient={activeTrack.fallbackGradient}
                    className="h-full w-full"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="h-4 w-4 text-white" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={onOpenFullPlayer}
                    className="block max-w-full truncate text-left text-xs font-bold text-white hover:underline"
                  >
                    {activeTrack.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenArtist(activeTrack.artist)}
                    className="block max-w-full truncate text-left text-[11px] text-white/55 hover:text-white hover:underline"
                  >
                    {activeTrack.artist}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(activeTrack.id)}
                    aria-label={isFavorite ? 'Remove favorite' : 'Favorite track'}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      isFavorite
                        ? 'text-rose-400 bg-rose-500/15'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDownload(activeTrack)}
                    aria-label={isDownloaded ? 'Remove offline download' : 'Download offline'}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      isDownloaded
                        ? 'text-emerald-300 bg-emerald-500/15'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {isDownloaded ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAddToPlaylist(activeTrack)}
                    aria-label="Add to playlist"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-white/45">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <KlynLogo size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/75">Ready to play</p>
                  <p className="text-[11px] text-white/45">Choose a song or podcast</p>
                </div>
              </div>
            )}
          </div>

          {/* Center: Transport + Scrubber */}
          <div className="mx-auto flex w-full max-w-xl flex-col items-center">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCycleShuffle}
                aria-label={`Shuffle: ${shuffleMode}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  shuffleMode !== 'off'
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                {shuffleMode === 'smart' ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <Shuffle className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onPrevTrack}
                aria-label="Previous track"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <SkipBack className="h-4 w-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                disabled={!activeTrack}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current translate-x-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onNextTrack}
                aria-label="Next track"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <SkipForward className="h-4 w-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={onCycleRepeat}
                aria-label={`Repeat: ${repeatMode}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  repeatMode !== 'off'
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="h-3.5 w-3.5" />
                ) : (
                  <Repeat className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <ExpandingScrubber
              currentTime={currentTime}
              duration={activeTrack?.duration ?? 0}
              onSeek={onSeek}
              compact
              showTimestamps
              className="mt-0.5"
            />
          </div>

          {/* Right: Panel Toggles (Lyrics, Devices, Queue) & Fullscreen Expand */}
          <div className="flex items-center justify-end gap-1.5">
            {connectedBluetoothDevice && (
              <button
                type="button"
                onClick={() => toggleRightPanel('devices')}
                className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"
              >
                <Bluetooth className="h-3 w-3" />
                <span className="max-w-[110px] truncate">{connectedBluetoothDevice.name}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => toggleRightPanel('lyrics')}
              aria-label="Toggle Lyrics panel"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                rightPanel === 'lyrics'
                  ? 'bg-white text-black'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Quote className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => toggleRightPanel('devices')}
              aria-label="Toggle Devices panel"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                rightPanel === 'devices'
                  ? 'bg-white text-black'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Airplay className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => toggleRightPanel('queue')}
              aria-label="Toggle Queue panel"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                rightPanel === 'queue'
                  ? 'bg-white text-black'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <ListMusic className="h-4 w-4" />
            </button>

            {activeTrack && (
              <button
                type="button"
                onClick={onOpenFullPlayer}
                aria-label="Expand fullscreen player"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/65 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
