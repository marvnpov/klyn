import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  Battery,
  BatteryCharging,
  Bell,
  BellRing,
  Bluetooth,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  Disc3,
  Headphones,
  Laptop,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Shield,
  Sliders,
  Smartphone,
  Speaker,
  Trash2,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { formatTime } from '../data/catalog';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getOfflineStorageStats, OfflineStorageStats } from '../services/offlineCache';
import {
  AccountDeviceRecord,
  AvatarStyle,
  BatterySnapshot,
  ConnectedAppProvider,
  CrossfadeDuration,
  DownloadQuality,
  StreamingQuality,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';
import { compressAvatarFile, computeInitials } from '../utils/avatarImage';
import { getNotificationPermissionState } from '../utils/notifications';
import { CoverArt } from './CoverArt';
import { KlynLogo } from './KlynLogo';
import { UserAvatar } from './UserAvatar';

export type SettingsSubPageId =
  | null
  | 'edit-profile'
  | 'downloads'
  | 'account'
  | 'notifications'
  | 'privacy'
  | 'playback'
  | 'devices'
  | 'quality';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  initialSubPage?: SettingsSubPageId;
  onClose: () => void;
  currentUser: UserAccount;
  onUpdateUser: (updatedUser: UserAccount) => void;
  preferences: UserPreferences;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
  followedArtists: Set<string>;
  playlistsCount: number;
  downloadedTracks: Track[];
  activeTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack?: (track: Track, queueList?: Track[]) => void;
  onTogglePlay?: () => void;
  onRemoveDownload?: (trackId: string) => void;
  onClearDownloads?: () => void;
  onSignOut: () => void;
  onClearHistory: () => void;
  activeDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  onOpenArtist: (artistName: string) => void;
  battery: BatterySnapshot;
  accountDevices: AccountDeviceRecord[];
  onTransferPlaybackToDevice: (device: AccountDeviceRecord) => void;
  onConnectApp: (provider: ConnectedAppProvider, handleOrUrl: string) => Promise<void>;
  onDisconnectApp: (provider: ConnectedAppProvider) => void;
  onRequestNotifications: () => Promise<void>;
  tracks?: Track[];
}

const SUBPAGE_TITLES: Record<Exclude<SettingsSubPageId, null>, string> = {
  'edit-profile': 'Edit Profile',
  downloads: 'App Downloads',
  account: 'Account & Cloud Sync',
  notifications: 'Notifications',
  privacy: 'Privacy',
  playback: 'Playback',
  devices: 'Apps & Devices',
  quality: 'Media Quality',
};

const MUSIC_APP_PROVIDERS: Array<{
  provider: ConnectedAppProvider;
  label: string;
  placeholder: string;
  accent: string;
}> = [
  {
    provider: 'spotify',
    label: 'Spotify',
    placeholder: 'Username or Spotify playlist URL',
    accent: '#1DB954',
  },
  {
    provider: 'audiomack',
    label: 'Audiomack',
    placeholder: '@handle or Audiomack link',
    accent: '#FFA200',
  },
  {
    provider: 'soundcloud',
    label: 'SoundCloud',
    placeholder: 'Username or SoundCloud URL',
    accent: '#FF5500',
  },
  {
    provider: 'tunesimo',
    label: 'Tunesimo',
    placeholder: '@handle or Tunesimo library link',
    accent: '#6366F1',
  },
];

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2];

const GENRE_OPTIONS = [
  'Trap',
  'R&B',
  'Hip-Hop',
  'Pop',
  'Afrobeats',
  'Electronic',
  'Alternative',
  'Soul',
];

const AVATAR_STYLES: Array<{ id: AvatarStyle; label: string }> = [
  { id: 'monogram', label: 'Monogram' },
  { id: 'obsidian-ring', label: 'Obsidian Ring' },
  { id: 'glass-emblem', label: 'Glass Emblem' },
  { id: 'halo', label: 'Halo Glow' },
];

const ACCENT_COLORS = [
  { hex: '#C27838', name: 'Amber' },
  { hex: '#B93848', name: 'Crimson' },
  { hex: '#2B78B8', name: 'Cobalt' },
  { hex: '#4D9473', name: 'Sage' },
  { hex: '#A1A1AA', name: 'Titanium' },
];

const GlassToggle: React.FC<{
  checked: boolean;
  onToggle: () => void;
  label: string;
}> = ({ checked, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onToggle}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
      checked
        ? 'bg-white border-white/80'
        : 'bg-white/12 border-white/15 hover:bg-white/18'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full shadow-md transition-transform duration-200 ${
        checked ? 'translate-x-6 bg-black' : 'translate-x-1 bg-white'
      }`}
    />
  </button>
);

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  initialSubPage = null,
  onClose,
  currentUser,
  onUpdateUser,
  preferences,
  onUpdatePreferences,
  followedArtists,
  playlistsCount,
  downloadedTracks,
  activeTrackId = '',
  isPlaying = false,
  onPlayTrack,
  onTogglePlay,
  onRemoveDownload,
  onClearDownloads,
  onSignOut,
  onClearHistory,
  activeDeviceId,
  onSelectDevice,
  onOpenArtist,
  battery,
  accountDevices,
  onTransferPlaybackToDevice,
  onConnectApp,
  onDisconnectApp,
  onRequestNotifications,
  tracks = [],
}) => {
  const [activeSubPage, setActiveSubPage] = useState<SettingsSubPageId>(initialSubPage);
  const [historyClearedNotice, setHistoryClearedNotice] = useState(false);
  const [appInputs, setAppInputs] = useState<Record<ConnectedAppProvider, string>>({
    spotify: '',
    audiomack: '',
    soundcloud: '',
    tunesimo: '',
  });
  const [syncingProvider, setSyncingProvider] = useState<ConnectedAppProvider | null>(null);
  const [notificationPerm, setNotificationPerm] = useState(() => getNotificationPermissionState());

  // Editable Profile Draft State
  const [draftName, setDraftName] = useState(currentUser.name);
  const [draftHandle, setDraftHandle] = useState(currentUser.handle);
  const [draftInitials, setDraftInitials] = useState(currentUser.initials);
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | undefined>(currentUser.avatarUrl);
  const [draftAvatarStyle, setDraftAvatarStyle] = useState<AvatarStyle>(
    currentUser.avatarStyle ?? 'monogram',
  );
  const [draftAccentColor, setDraftAccentColor] = useState(currentUser.accentColor ?? '#C27838');
  const [draftGenres, setDraftGenres] = useState<string[]>(currentUser.favoriteGenres);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<OfflineStorageStats | null>(null);
  const [installLabel, setInstallLabel] = useState<string | null>(null);
  const lastStatsKeyRef = useRef<string>('');
  const { isInstalled, install } = usePWAInstall();
  const {
    devices: audioDevices,
    isScanningBluetooth,
    scanStatus,
    scanBluetoothDevices,
    refreshAudioOutputs,
    removeBluetoothDevice,
  } = useAudioDevices();

  useEffect(() => {
    if (isOpen) {
      setActiveSubPage(initialSubPage ?? null);
      setNotificationPerm(getNotificationPermissionState());
    } else {
      setActiveSubPage(null);
    }
  }, [isOpen, initialSubPage]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftName(currentUser.name);
    setDraftHandle(currentUser.handle);
    setDraftInitials(currentUser.initials);
    setDraftAvatarUrl(currentUser.avatarUrl);
    setDraftAvatarStyle(currentUser.avatarStyle ?? 'monogram');
    setDraftAccentColor(currentUser.accentColor ?? '#C27838');
    setDraftGenres(currentUser.favoriteGenres);
    setPhotoError(null);
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen || activeSubPage !== 'downloads') {
      lastStatsKeyRef.current = '';
      return;
    }
    const statsKey = `${activeSubPage}::${downloadedTracks.length}`;
    if (lastStatsKeyRef.current === statsKey) return;
    lastStatsKeyRef.current = statsKey;

    let active = true;
    getOfflineStorageStats()
      .then((stats) => {
        if (active) setStorageStats(stats);
      })
      .catch(() => {
        // Fallback silently if storage stats are unavailable
      });
    return () => {
      active = false;
    };
  }, [isOpen, activeSubPage, downloadedTracks.length]);

  const handleDirectInstall = async () => {
    const outcome = await install();
    if (outcome === 'installed') {
      setInstallLabel('App Installed');
    } else if (outcome === 'unavailable') {
      setInstallLabel('Open directly to install');
      window.setTimeout(() => setInstallLabel(null), 2600);
    } else {
      setInstallLabel(null);
    }
  };

  const handleConnectProvider = async (provider: ConnectedAppProvider) => {
    setSyncingProvider(provider);
    try {
      await onConnectApp(provider, appInputs[provider] || currentUser.handle);
      setAppInputs((prev) => ({ ...prev, [provider]: '' }));
    } finally {
      setSyncingProvider(null);
    }
  };

  if (!isOpen) return null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose a PNG, JPG, or WebP image.');
      return;
    }
    try {
      setPhotoError(null);
      const dataUrl = await compressAvatarFile(file);
      setDraftAvatarUrl(dataUrl);
    } catch {
      setPhotoError('Could not load that image. Try a smaller PNG or JPG.');
    }
  };

  const toggleDraftGenre = (genre: string) => {
    setDraftGenres((prev) => {
      if (prev.includes(genre)) {
        return prev.length > 1 ? prev.filter((g) => g !== genre) : prev;
      }
      return [...prev, genre].slice(0, 5);
    });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = draftName.trim() || currentUser.name;
    const rawHandle = draftHandle.trim().replace(/^@+/, '').replace(/\s+/g, '');
    const cleanHandle = rawHandle
      ? `@${rawHandle}`
      : `@${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'listener'}`;
    const cleanInitials =
      (draftInitials.trim() || computeInitials(cleanName)).slice(0, 2).toUpperCase();

    onUpdateUser({
      ...currentUser,
      name: cleanName,
      handle: cleanHandle,
      initials: cleanInitials,
      avatarUrl: draftAvatarUrl,
      avatarStyle: draftAvatarStyle,
      accentColor: draftAccentColor,
      favoriteGenres: draftGenres.length > 0 ? draftGenres : currentUser.favoriteGenres,
    });
    setActiveSubPage(null);
  };

  const listenerBadge = `${preferences.streamingQuality} · Hi-Res`;

  const followedList = Array.from(followedArtists);
  const artistCoverMap = new Map<string, string>();
  tracks.forEach((t) => {
    const key = t.artist.toLowerCase();
    if (!artistCoverMap.has(key) && t.coverUrl) {
      artistCoverMap.set(key, t.coverUrl);
    }
  });

  const handleCloseProfile = () => {
    setActiveSubPage(null);
    onClose();
  };

  const handleClearHistory = () => {
    onClearHistory();
    setHistoryClearedNotice(true);
    window.setTimeout(() => setHistoryClearedNotice(false), 2000);
  };

  const accent = currentUser.accentColor || '#C27838';
  const avatarStyle = currentUser.avatarStyle || 'monogram';

  const settingsGroups = [
    {
      label: 'Identity & Offline Library',
      items: [
        {
          id: 'edit-profile' as const,
          title: 'Edit Profile & Photo',
          subtitle: `${currentUser.name} · ${currentUser.handle}`,
          icon: Pencil,
        },
        {
          id: 'downloads' as const,
          title: 'App Downloads',
          subtitle: `${downloadedTracks.length} ${
            downloadedTracks.length === 1 ? 'track' : 'tracks'
          } saved offline · ${preferences.downloadQuality}`,
          icon: ArrowDownToLine,
        },
      ],
    },
    {
      label: 'Audio & Devices',
      items: [
        {
          id: 'quality' as const,
          title: 'Media Quality',
          subtitle: `${preferences.streamingQuality} streaming · ${preferences.downloadQuality} downloads`,
          icon: Disc3,
        },
        {
          id: 'playback' as const,
          title: 'Playback & Crossfade',
          subtitle: `${preferences.gaplessPlayback ? 'Gapless' : 'Standard'} · ${
            preferences.crossfadeSeconds > 0
              ? `${preferences.crossfadeSeconds}s crossfade`
              : 'No crossfade'
          }`,
          icon: Sliders,
        },
        {
          id: 'devices' as const,
          title: 'Apps and Devices',
          subtitle:
            audioDevices.find((d) => d.id === activeDeviceId)?.name ??
            'This Device · System Output',
          icon: Smartphone,
        },
      ],
    },
    {
      label: 'Account, Alerts & Privacy',
      items: [
        {
          id: 'notifications' as const,
          title: 'Notifications',
          subtitle: preferences.notifyNewReleases
            ? `${followedList.length} artist release alerts active`
            : 'Release alerts paused',
          icon: Bell,
        },
        {
          id: 'privacy' as const,
          title: 'Privacy & History',
          subtitle: preferences.privateSession
            ? 'Private Session active'
            : 'Activity sharing enabled',
          icon: Shield,
        },
        {
          id: 'account' as const,
          title: 'Account & Cloud Sync',
          subtitle: currentUser.uid ? 'Google Cloud Sync active' : currentUser.email,
          icon: User,
        },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile and Settings"
      className="fixed inset-0 z-[60] flex flex-col bg-[#000000]/96 backdrop-blur-3xl text-white transition-all duration-300"
    >
      {/* Subtle Adaptive Header Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-80 opacity-24 blur-[120px]"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent}66 0%, rgba(39,39,42,0.18) 52%, #000000 100%)`,
        }}
      />

      {/* Sticky Top Header */}
      <header className="relative z-10 flex items-center justify-center border-b border-white/[0.08] px-4 pt-4 pb-3.5">
        <div className="flex w-full max-w-3xl items-center justify-between gap-3">
          {activeSubPage ? (
            <button
              type="button"
              onClick={() => setActiveSubPage(null)}
              className="liquid-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/95 hover:bg-white/14 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Profile</span>
            </button>
          ) : (
            <div className="w-20" />
          )}

          <h1 className="font-display truncate text-base font-bold text-white">
            {activeSubPage ? SUBPAGE_TITLES[activeSubPage] : 'Profile & Settings'}
          </h1>

          <button
            type="button"
            onClick={handleCloseProfile}
            aria-label="Close Profile and Settings"
            className="liquid-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/14 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Scrollable Body */}
      <div className="glass-scroll relative z-10 flex-1 overflow-y-auto px-4 py-6 pb-16">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* MAIN PROFILE & SETTINGS OVERVIEW */}
          {activeSubPage === null && (
            <>
              {/* Hero Identity Card */}
              <section className="liquid-glass-elevated relative overflow-hidden rounded-[32px] p-5 sm:p-7">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full opacity-25 blur-3xl"
                  style={{ backgroundColor: accent }}
                />

                <div className="relative z-10 flex flex-col gap-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-4 min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveSubPage('edit-profile')}
                        aria-label="Edit profile picture"
                        className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                      >
                        <UserAvatar
                          name={currentUser.name}
                          initials={currentUser.initials}
                          avatarUrl={currentUser.avatarUrl}
                          avatarStyle={avatarStyle}
                          accentColor={accent}
                          sizeClass="h-20 w-20"
                          textClass="text-2xl"
                          glow
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-105">
                          <Camera className="h-3.5 w-3.5" />
                        </span>
                      </button>

                      <div className="min-w-0">
                        <h2 className="font-display truncate text-2xl sm:text-3xl font-bold tracking-tight text-white">
                          {currentUser.name}
                        </h2>
                        <p className="mt-0.5 truncate text-xs sm:text-sm text-white/55">
                          {currentUser.handle} · {currentUser.email}
                        </p>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-white/75">
                          <KlynLogo size={16} className="rounded-[5px]" />
                          <span>{listenerBadge}</span>
                          {currentUser.uid && (
                            <>
                              <span aria-hidden="true">·</span>
                              <Cloud className="h-3.5 w-3.5 text-white/70" />
                              <span>Cloud Synced</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSubPage('edit-profile')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit Profile</span>
                      </button>
                      <button
                        type="button"
                        disabled={isInstalled}
                        onClick={() => void handleDirectInstall()}
                        className="liquid-glass inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white/95 hover:bg-white/14 transition-colors disabled:opacity-70"
                      >
                        {isInstalled ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Installed</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                            <span>{installLabel ?? 'Install App'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Clean Stat Tiles */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-3 text-center">
                      <p className="font-display text-xl font-bold text-white tabular-nums">
                        {followedArtists.size}
                      </p>
                      <p className="text-[11px] font-medium text-white/55 mt-0.5">Following</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-3 text-center">
                      <p className="font-display text-xl font-bold text-white tabular-nums">
                        {playlistsCount}
                      </p>
                      <p className="text-[11px] font-medium text-white/55 mt-0.5">Playlists</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSubPage('downloads')}
                      className="rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-3 text-center hover:bg-white/[0.1] transition-colors"
                    >
                      <p className="font-display text-xl font-bold text-white tabular-nums">
                        {downloadedTracks.length}
                      </p>
                      <p className="text-[11px] font-medium text-white/65 mt-0.5">
                        Offline Downloads
                      </p>
                    </button>
                  </div>

                  {followedList.length > 0 && (
                    <div className="border-t border-white/10 pt-4">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/60">
                          <Users className="h-3.5 w-3.5" />
                          <span>Following Artists</span>
                        </span>
                        <span className="text-[11px] text-white/45">Tap to open</span>
                      </div>
                      <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
                        {followedList.map((name) => {
                          const artUrl = artistCoverMap.get(name.toLowerCase()) ?? '';
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                handleCloseProfile();
                                onOpenArtist(name);
                              }}
                              className="liquid-glass inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-semibold text-white hover:bg-white/14 transition-colors"
                            >
                              <CoverArt src={artUrl} alt={name} className="h-6 w-6 rounded-full" />
                              <span>{name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Dedicated Direct App Install Card */}
              <section
                aria-label="Install klyn App"
                className="liquid-glass-elevated flex items-center justify-between gap-4 rounded-[28px] px-5 py-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <KlynLogo size={44} className="shrink-0 rounded-2xl" />
                  <div className="min-w-0">
                    <p className="truncate text-sm sm:text-base font-semibold text-white">
                      Install klyn App
                    </p>
                    <p className="truncate text-xs text-white/55">
                      {isInstalled
                        ? 'Installed on this device'
                        : installLabel ?? 'Install directly to your device'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isInstalled}
                  onClick={() => void handleDirectInstall()}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    isInstalled
                      ? 'bg-white/12 text-white/75 border border-white/15 cursor-default'
                      : 'bg-white text-black shadow-lg hover:scale-[1.03] active:scale-95'
                  }`}
                >
                  {isInstalled ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Installed</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      <span>Install</span>
                    </>
                  )}
                </button>
              </section>

              {/* Grouped Settings Cards */}
              {settingsGroups.map((group) => (
                <section key={group.label} aria-label={group.label} className="space-y-2">
                  <h3 className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    {group.label}
                  </h3>
                  <div className="liquid-glass divide-y divide-white/[0.08] rounded-[28px] overflow-hidden">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSubPage(item.id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] border border-white/12">
                              <Icon className="h-4.5 w-4.5 text-white/85" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm sm:text-base font-semibold text-white">
                                {item.title}
                              </p>
                              <p className="truncate text-xs text-white/55">{item.subtitle}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4.5 w-4.5 shrink-0 text-white/45" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}

          {/* SUB-PAGE: OFFLINE APP DOWNLOADS */}
          {activeSubPage === 'downloads' && (
            <div className="space-y-5">
              <div className="liquid-glass-elevated rounded-[28px] p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Offline Storage · IndexedDB
                  </p>
                  <h2 className="font-display mt-1 text-xl font-bold text-white tabular-nums">
                    {downloadedTracks.length} {downloadedTracks.length === 1 ? 'song' : 'songs'} downloaded
                    {storageStats ? ` · ${storageStats.formattedSize}` : ''}
                  </h2>
                  <p className="text-xs text-white/55 mt-0.5">
                    Quality: {preferences.downloadQuality} · Accessible offline inside Library &rarr; Downloaded
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {downloadedTracks.length > 0 && onPlayTrack && (
                    <button
                      type="button"
                      onClick={() => {
                        onPlayTrack(downloadedTracks[0], downloadedTracks);
                        handleCloseProfile();
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] transition-transform"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Play Offline</span>
                    </button>
                  )}
                  {downloadedTracks.length > 0 && onClearDownloads && (
                    <button
                      type="button"
                      onClick={onClearDownloads}
                      className="liquid-glass inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/14 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>
              </div>

              {downloadedTracks.length === 0 ? (
                <div className="liquid-glass rounded-[28px] p-8 text-center space-y-2">
                  <ArrowDownToLine className="mx-auto h-7 w-7 text-white/45" />
                  <p className="text-sm font-semibold text-white">No downloaded songs yet</p>
                  <p className="text-xs text-white/55 max-w-sm mx-auto">
                    Tap the download icon inside the Full-Screen Player, Search, Artist profiles, or Playlists to save tracks into your App Downloads.
                  </p>
                </div>
              ) : (
                <div className="liquid-glass divide-y divide-white/[0.08] rounded-[28px] px-3">
                  {downloadedTracks.map((track) => {
                    const isCurrent = track.id === activeTrackId;
                    return (
                      <div
                        key={`settings-dl-${track.id}`}
                        className="flex items-center gap-3.5 py-3 px-2 rounded-2xl hover:bg-white/[0.04] transition-colors"
                      >
                        <CoverArt
                          src={track.coverUrl}
                          alt={track.title}
                          fallbackGradient={track.fallbackGradient}
                          className="h-12 w-12 shrink-0 rounded-xl"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                              <Check className="h-2.5 w-2.5" />
                              <span>Offline</span>
                            </span>
                          </div>
                          <p className="truncate text-xs text-white/55">
                            {track.artist} · {formatTime(track.duration)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {onPlayTrack && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isCurrent && onTogglePlay) onTogglePlay();
                                else onPlayTrack(track, downloadedTracks);
                              }}
                              aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white hover:text-black transition-colors"
                            >
                              {isCurrent && isPlaying ? (
                                <Pause className="h-4 w-4 fill-current" />
                              ) : (
                                <Play className="h-4 w-4 fill-current translate-x-0.5" />
                              )}
                            </button>
                          )}
                          {onRemoveDownload && (
                            <button
                              type="button"
                              onClick={() => onRemoveDownload(track.id)}
                              aria-label={`Remove ${track.title} from downloads`}
                              className="flex h-9 w-9 items-center justify-center rounded-full text-white/55 hover:bg-white/12 hover:text-white transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-PAGE: EDIT PROFILE */}
          {activeSubPage === 'edit-profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="liquid-glass-elevated rounded-[30px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
                <UserAvatar
                  name={draftName || 'Listener'}
                  initials={(draftInitials || computeInitials(draftName)).slice(0, 2).toUpperCase()}
                  avatarUrl={draftAvatarUrl}
                  avatarStyle={draftAvatarStyle}
                  accentColor={draftAccentColor}
                  sizeClass="h-22 w-22"
                  textClass="text-2xl"
                  glow
                />

                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="font-display truncate text-xl font-bold text-white">
                      {draftName.trim() || 'klyn Listener'}
                    </p>
                    <p className="truncate text-xs text-white/55">
                      {draftHandle.trim() || '@listener'} · {draftGenres.slice(0, 3).join(' · ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:scale-[1.02] transition-transform">
                      <Camera className="h-3.5 w-3.5" />
                      <span>{draftAvatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="sr-only"
                      />
                    </label>
                    {draftAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setDraftAvatarUrl(undefined)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white/[0.08] border border-white/14 px-3.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/16 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove Photo</span>
                      </button>
                    )}
                  </div>
                  {photoError && <p className="text-[11px] text-rose-300">{photoError}</p>}
                </div>
              </div>

              <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-white/65 mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => {
                        setDraftName(e.target.value);
                        setDraftInitials(computeInitials(e.target.value));
                      }}
                      placeholder="Your name"
                      className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/14 px-3.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/65 mb-1.5">
                      @handle
                    </label>
                    <input
                      type="text"
                      value={draftHandle}
                      onChange={(e) => setDraftHandle(e.target.value)}
                      placeholder="@klynlistener"
                      className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/14 px-3.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/65 mb-1.5">
                      Initials
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={draftInitials}
                      onChange={(e) => setDraftInitials(e.target.value.toUpperCase())}
                      className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/14 px-3.5 text-center font-display text-sm font-bold uppercase text-white focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-medium text-white/65 mb-2">Avatar Frame Style</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {AVATAR_STYLES.map((st) => {
                      const selected = draftAvatarStyle === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setDraftAvatarStyle(st.id)}
                          className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                            selected
                              ? 'bg-white text-black'
                              : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-medium text-white/65 mb-2">Glass Accent Glow</p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ACCENT_COLORS.map((color) => {
                      const selected = draftAccentColor === color.hex;
                      return (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => setDraftAccentColor(color.hex)}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                            selected
                              ? 'bg-white/16 border-white text-white'
                              : 'bg-white/[0.05] border-white/12 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span>{color.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-white/65">Favorite Genres</p>
                    <span className="text-[11px] text-white/45 tabular-nums">
                      {draftGenres.length} selected (max 5)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_OPTIONS.map((genre) => {
                      const active = draftGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => toggleDraftGenre(genre)}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                            active
                              ? 'bg-white text-black'
                              : 'bg-white/[0.06] border border-white/12 text-white/80 hover:bg-white/12'
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSubPage(null)}
                  className="liquid-glass rounded-full px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/14 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 px-5 text-sm font-semibold text-black shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                  <Check className="h-4 w-4" />
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          )}

          {/* SUB-PAGE: ACCOUNT MANAGEMENT */}
          {activeSubPage === 'account' && (
            <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-white/60">Account Name</span>
                <span className="font-medium text-white">{currentUser.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-t border-white/10 pt-3">
                <span className="text-white/60">Handle</span>
                <span className="font-medium text-white">{currentUser.handle}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-t border-white/10 pt-3">
                <span className="text-white/60">Account Email</span>
                <span className="font-medium text-white">{currentUser.email}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-t border-white/10 pt-3">
                <span className="text-white/60">Cloud Sync</span>
                <span className="font-medium text-white">
                  {currentUser.uid ? 'Firebase Firestore Synced' : 'Local Device Profile'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-t border-white/10 pt-3">
                <span className="text-white/60">Taste Profile</span>
                <span className="font-medium text-white text-right">
                  {currentUser.favoriteGenres.join(', ')}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubPage('edit-profile')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 px-4 text-sm font-semibold text-black hover:scale-[1.01] transition-transform"
                >
                  <Pencil className="h-4 w-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseProfile();
                    onSignOut();
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/12 border border-white/18 py-3 px-4 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>

              <div className="border-t border-white/10 pt-3">
                <button
                  type="button"
                  disabled={isInstalled}
                  onClick={() => void handleDirectInstall()}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-white/[0.08] border border-white/16 py-2.5 px-4 text-xs font-semibold text-white hover:bg-white/16 transition-colors disabled:opacity-70"
                >
                  {isInstalled ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>KLYN App Installed</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      <span>{installLabel ?? 'Install KLYN App'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* SUB-PAGE: NOTIFICATIONS */}
          {activeSubPage === 'notifications' && (
            <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Device Push Notifications</p>
                  <p className="text-xs text-white/55">
                    {notificationPerm === 'granted'
                      ? 'Enabled for new artist releases & invites'
                      : notificationPerm === 'denied'
                        ? 'Blocked in browser site settings'
                        : notificationPerm === 'unsupported'
                          ? 'Unavailable in this preview frame'
                          : 'Allow real-time KLYN desktop & mobile alerts'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={notificationPerm === 'granted' || notificationPerm === 'unsupported'}
                  onClick={() => {
                    void onRequestNotifications().then(() => {
                      setNotificationPerm(getNotificationPermissionState());
                    });
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    notificationPerm === 'granted'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-white text-black hover:scale-[1.02] disabled:opacity-50'
                  }`}
                >
                  {notificationPerm === 'granted' ? 'Enabled' : 'Enable Alerts'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    New Releases from Followed Artists
                  </p>
                  <p className="text-xs text-white/55">
                    Instant alerts when followed artists drop singles or LPs
                  </p>
                </div>
                <GlassToggle
                  checked={preferences.notifyNewReleases}
                  onToggle={() =>
                    onUpdatePreferences({ notifyNewReleases: !preferences.notifyNewReleases })
                  }
                  label="New Releases from Followed Artists"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    Blend &amp; Listen Party Pop-Up Invites
                  </p>
                  <p className="text-xs text-white/55">
                    Real-time pop-ups when friends send a Blend or Listen Party invite
                  </p>
                </div>
                <GlassToggle
                  checked={preferences.notifySocialInvites}
                  onToggle={() =>
                    onUpdatePreferences({ notifySocialInvites: !preferences.notifySocialInvites })
                  }
                  label="Blend and Listen Party Pop-Up Invites"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Klyn Wrapped &amp; Weekly Activity</p>
                  <p className="text-xs text-white/55">Weekly listening summary &amp; top artist recaps</p>
                </div>
                <GlassToggle
                  checked={preferences.notifyWrappedWeekly}
                  onToggle={() =>
                    onUpdatePreferences({ notifyWrappedWeekly: !preferences.notifyWrappedWeekly })
                  }
                  label="Klyn Wrapped and Weekly Activity"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Playlist &amp; Library Updates</p>
                  <p className="text-xs text-white/55">Curated mix refreshes &amp; Lossless upgrades</p>
                </div>
                <GlassToggle
                  checked={preferences.notifyPlaylistUpdates}
                  onToggle={() =>
                    onUpdatePreferences({
                      notifyPlaylistUpdates: !preferences.notifyPlaylistUpdates,
                    })
                  }
                  label="Playlist and Library Updates"
                />
              </div>

              {preferences.notifyNewReleases && followedList.length > 0 && (
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    <BellRing className="h-3.5 w-3.5" />
                    <span>Followed Artist Alerts ({followedList.length})</span>
                  </p>
                  {followedList.map((artistName) => (
                    <button
                      key={artistName}
                      type="button"
                      onClick={() => {
                        handleCloseProfile();
                        onOpenArtist(artistName);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/8 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoverArt
                          src={artistCoverMap.get(artistName.toLowerCase()) ?? ''}
                          alt={artistName}
                          className="h-9 w-9 shrink-0 rounded-full"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs sm:text-sm font-semibold text-white">
                            {artistName}
                          </p>
                          <p className="truncate text-xs text-white/55">
                            Release notifications enabled
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-white/75">Open</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUB-PAGE: PRIVACY */}
          {activeSubPage === 'privacy' && (
            <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Listening Activity Visibility</p>
                  <p className="text-xs text-white/55">Show your recent plays on friends&apos; feeds</p>
                </div>
                <GlassToggle
                  checked={preferences.listeningVisibility}
                  onToggle={() =>
                    onUpdatePreferences({
                      listeningVisibility: !preferences.listeningVisibility,
                    })
                  }
                  label="Listening Activity Visibility"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Private Session Mode</p>
                  <p className="text-xs text-white/55">Listen without updating activity log</p>
                </div>
                <GlassToggle
                  checked={preferences.privateSession}
                  onToggle={() =>
                    onUpdatePreferences({ privateSession: !preferences.privateSession })
                  }
                  label="Private Session Mode"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Share Analytics with Artists</p>
                  <p className="text-xs text-white/55">Anonymous playback telemetry for creators</p>
                </div>
                <GlassToggle
                  checked={preferences.shareArtistAnalytics}
                  onToggle={() =>
                    onUpdatePreferences({
                      shareArtistAnalytics: !preferences.shareArtistAnalytics,
                    })
                  }
                  label="Share Analytics with Artists"
                />
              </div>

              <button
                type="button"
                onClick={handleClearHistory}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-white/[0.08] border border-white/14 py-3 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-white/16 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>
                  {historyClearedNotice ? 'Listening History Cleared' : 'Clear Listening History'}
                </span>
              </button>
            </div>
          )}

          {/* SUB-PAGE: PLAYBACK */}
          {activeSubPage === 'playback' && (
            <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Gapless Playback</p>
                  <p className="text-xs text-white/55">Seamless transitions between album tracks</p>
                </div>
                <GlassToggle
                  checked={preferences.gaplessPlayback}
                  onToggle={() =>
                    onUpdatePreferences({ gaplessPlayback: !preferences.gaplessPlayback })
                  }
                  label="Gapless Playback"
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Automix / Crossfade</p>
                    <p className="text-xs text-white/55">Smoothly overlap track intros &amp; outros</p>
                  </div>
                  <span className="text-xs font-semibold text-white tabular-nums">
                    {preferences.crossfadeSeconds === 0 ? 'Off' : `${preferences.crossfadeSeconds}s`}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {([0, 3, 6, 12] as CrossfadeDuration[]).map((sec) => {
                    const selected = preferences.crossfadeSeconds === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onUpdatePreferences({ crossfadeSeconds: sec })}
                        className={`rounded-full py-2 text-xs font-semibold transition-colors tabular-nums ${
                          selected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                        }`}
                      >
                        {sec === 0 ? 'Off' : `${sec}s`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Autoplay Similar Tracks</p>
                  <p className="text-xs text-white/55">Keep music playing after your queue ends</p>
                </div>
                <GlassToggle
                  checked={preferences.autoplaySimilar}
                  onToggle={() =>
                    onUpdatePreferences({ autoplaySimilar: !preferences.autoplaySimilar })
                  }
                  label="Autoplay Similar Tracks"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">Auto-Scroll Synced Lyrics</p>
                  <p className="text-xs text-white/55">Follow active lyric line automatically</p>
                </div>
                <GlassToggle
                  checked={preferences.autoScrollLyrics}
                  onToggle={() =>
                    onUpdatePreferences({ autoScrollLyrics: !preferences.autoScrollLyrics })
                  }
                  label="Auto-Scroll Synced Lyrics"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="flex items-center gap-2.5">
                  <WifiOff className="h-4 w-4 text-white/65 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Offline Mode</p>
                    <p className="text-xs text-white/55">
                      Only allow playback of downloaded tracks saved offline
                    </p>
                  </div>
                </div>
                <GlassToggle
                  checked={Boolean(preferences.offlineMode)}
                  onToggle={() =>
                    onUpdatePreferences({ offlineMode: !preferences.offlineMode })
                  }
                  label="Offline Mode"
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Podcast &amp; Audiobook Speed
                    </p>
                    <p className="text-xs text-white/55">Default playback rate for spoken shows</p>
                  </div>
                  <span className="text-xs font-semibold text-white tabular-nums">
                    {preferences.playbackSpeed ?? 1}x
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {PLAYBACK_SPEEDS.map((spd) => {
                    const selected = (preferences.playbackSpeed ?? 1) === spd;
                    return (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onUpdatePreferences({ playbackSpeed: spd })}
                        className={`rounded-full py-2 text-xs font-semibold transition-colors tabular-nums ${
                          selected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                        }`}
                      >
                        {spd}x
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Display Layout</p>
                    <p className="text-xs text-white/55">
                      Adaptive computer sidebar workspace vs. floating mobile dock
                    </p>
                  </div>
                  <span className="text-xs font-semibold capitalize text-white">
                    {preferences.layoutMode ?? 'auto'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'desktop', label: 'Computer' },
                      { id: 'mobile', label: 'Mobile' },
                    ] as const
                  ).map((opt) => {
                    const selected = (preferences.layoutMode ?? 'auto') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdatePreferences({ layoutMode: opt.id })}
                        className={`rounded-full py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SUB-PAGE: APPS AND DEVICES */}
          {activeSubPage === 'devices' && (
            <div className="space-y-5">
              {/* 1. This Device Live Battery */}
              <div className="liquid-glass rounded-[30px] p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/12">
                    {battery.charging ? (
                      <BatteryCharging className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Battery className="h-5 w-5 text-white/85" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      This Device Live Battery
                    </p>
                    <p className="font-display text-lg font-bold text-white tabular-nums">
                      {battery.supported && typeof battery.level === 'number'
                        ? `${battery.level}%${battery.charging ? ' · Charging' : ' · On Battery'}`
                        : 'Battery telemetry unavailable'}
                    </p>
                  </div>
                </div>
                {battery.supported && typeof battery.level === 'number' && (
                  <div className="h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        battery.charging
                          ? 'bg-emerald-400'
                          : battery.level <= 20
                            ? 'bg-rose-400'
                            : 'bg-white'
                      }`}
                      style={{ width: `${battery.level}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 2. Connected Music Apps (Spotify, Audiomack, SoundCloud, Tunesimo) */}
              <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/55">
                    Connected Music Apps
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Link and import tracks from your other streaming accounts into your Library
                  </p>
                </div>

                <div className="space-y-2.5">
                  {MUSIC_APP_PROVIDERS.map(({ provider, label, placeholder, accent: appAccent }) => {
                    const entry = currentUser.connectedApps?.[provider];
                    const isConnected = Boolean(entry?.connected);
                    const isBusy = syncingProvider === provider;

                    return (
                      <div
                        key={provider}
                        className="rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: appAccent }}
                            />
                            <div className="flex items-baseline gap-2 min-w-0">
                              <p className="text-sm font-semibold text-white shrink-0">{label}</p>
                              {isConnected && (
                                <p className="truncate text-[11px] text-white/55">
                                  {entry?.handleOrId || 'Connected'}
                                  {typeof entry?.importedCount === 'number'
                                    ? ` · ${entry.importedCount} tracks`
                                    : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          {isConnected ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleConnectProvider(provider)}
                                className="rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-60"
                              >
                                {isBusy ? 'Syncing...' : 'Re-Sync'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDisconnectApp(provider)}
                                className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/14 hover:text-white transition-colors"
                              >
                                Disconnect
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[260px]">
                              <input
                                type="text"
                                value={appInputs[provider]}
                                onChange={(e) =>
                                  setAppInputs((prev) => ({ ...prev, [provider]: e.target.value }))
                                }
                                placeholder={placeholder}
                                className="min-w-0 flex-1 rounded-full bg-white/[0.07] border border-white/12 px-3 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-white/35 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleConnectProvider(provider)}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-60"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Link2 className="h-3 w-3" />
                                )}
                                <span>{isBusy ? 'Syncing' : 'Connect'}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {entry?.syncError && (
                          <p className="text-[11px] text-amber-300/90">{entry.syncError}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Active Devices on Your Account (Cross-Device Handoff) */}
              <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/55">
                    Active Devices on Your Account
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Live Firebase sessions across your phones, tablets, and desktops
                  </p>
                </div>

                {accountDevices.length === 0 ? (
                  <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-xs text-white/55">
                    Sign in with Firebase Cloud Sync to see your other active KLYN devices here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accountDevices.map((dev) => (
                      <div
                        key={dev.deviceId}
                        className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                          dev.isCurrentDevice
                            ? 'bg-white/14 border border-white/20'
                            : 'bg-white/[0.04] border border-white/8'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {dev.platform === 'iOS' || dev.platform === 'Android' ? (
                            <Smartphone className="h-4.5 w-4.5 shrink-0 text-white/85" />
                          ) : (
                            <Laptop className="h-4.5 w-4.5 shrink-0 text-white/85" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {dev.name} {dev.isCurrentDevice ? '(This Device)' : ''}
                            </p>
                            <p className="truncate text-xs text-white/55">
                              {dev.activeTrackTitle
                                ? `${dev.isPlaying ? 'Playing' : 'Paused'}: ${dev.activeTrackTitle}`
                                : `${dev.platform} · Ready`}
                              {typeof dev.batteryLevel === 'number'
                                ? ` · ${dev.batteryLevel}% battery`
                                : ''}
                            </p>
                          </div>
                        </div>
                        {!dev.isCurrentDevice && dev.activeTrackId && (
                          <button
                            type="button"
                            onClick={() => onTransferPlaybackToDevice(dev)}
                            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black hover:scale-[1.03] active:scale-95 transition-transform"
                          >
                            Play Here
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Bluetooth & Audio Outputs */}
              <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/55">
                      Audio Output &amp; Bluetooth
                    </p>
                    <p className="text-xs text-white/45 mt-0.5">
                      Real system outputs &amp; nearby Bluetooth devices
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isScanningBluetooth}
                      onClick={() => {
                        void scanBluetoothDevices().then((added) => {
                          if (added) onSelectDevice(added.id);
                        });
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-70"
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
                      aria-label="Refresh connected outputs"
                      className="liquid-glass inline-flex h-[38px] w-[38px] items-center justify-center rounded-full text-white/85 hover:bg-white/14 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {scanStatus && (
                  <p className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-2.5 text-xs text-white/75">
                    {scanStatus}
                  </p>
                )}

                <div className="space-y-2.5">
                  {audioDevices.map((device) => {
                    const selected = device.id === activeDeviceId;
                    const Icon =
                      device.type === 'bluetooth'
                        ? Bluetooth
                        : device.type === 'headphones'
                          ? Headphones
                          : device.type === 'desktop'
                            ? Laptop
                            : device.type === 'phone'
                              ? Smartphone
                              : Speaker;
                    return (
                      <div
                        key={device.id}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors ${
                          selected
                            ? 'bg-white/14 border border-white/20'
                            : 'bg-white/[0.04] border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectDevice(device.id)}
                          className="flex flex-1 min-w-0 items-center gap-3 text-left"
                        >
                          <Icon className="h-4.5 w-4.5 shrink-0 text-white/85" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{device.name}</p>
                            <p className="truncate text-xs text-white/55">{device.detail}</p>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {typeof device.batteryLevel === 'number' && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 tabular-nums">
                              {device.batteryLevel}%
                            </span>
                          )}
                          {selected && <Check className="h-4 w-4 text-white" />}
                          {device.source === 'bluetooth' && (
                            <button
                              type="button"
                              onClick={() => {
                                removeBluetoothDevice(device.id);
                                if (selected) onSelectDevice('system-default');
                              }}
                              aria-label={`Remove ${device.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/12 hover:text-white transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SUB-PAGE: MEDIA QUALITY */}
          {activeSubPage === 'quality' && (
            <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-5">
              <div>
                <p className="mb-2.5 text-xs font-semibold text-white/60">Streaming Quality</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Normal', 'High', 'Lossless'] as StreamingQuality[]).map((q) => {
                    const selected = preferences.streamingQuality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onUpdatePreferences({ streamingQuality: q })}
                        className={`rounded-full py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="mb-2.5 text-xs font-semibold text-white/60">Download Quality</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Normal', 'High', 'Lossless'] as DownloadQuality[]).map((q) => {
                    const selected = preferences.downloadQuality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onUpdatePreferences({ downloadQuality: q })}
                        className={`rounded-full py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/14'
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    Normalize Volume Across Tracks
                  </p>
                  <p className="text-xs text-white/55">Consistent loudness level between mixes</p>
                </div>
                <GlassToggle
                  checked={preferences.normalizeVolume}
                  onToggle={() =>
                    onUpdatePreferences({ normalizeVolume: !preferences.normalizeVolume })
                  }
                  label="Normalize Volume Across Tracks"
                />
              </div>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/40 pt-2">
            <KlynLogo size={14} className="rounded-[4px]" />
            <Lock className="h-3 w-3" />
            <span>
              klyn Audio Engine · {currentUser.uid ? 'Synced to Firebase Cloud' : 'Saved locally'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
