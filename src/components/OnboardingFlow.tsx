import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { connectAndSyncExternalApp } from '../services/connectedApps';
import {
  ConnectedAppEntry,
  ConnectedAppProvider,
  PlaylistItem,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';
import { compressAvatarFile, computeInitials } from '../utils/avatarImage';
import { requestNotificationPermission, sendKlynNotification } from '../utils/notifications';
import { KlynLogo } from './KlynLogo';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';
import { UserAvatar } from './UserAvatar';

interface OnboardingFlowProps {
  user: UserAccount;
  preferences: UserPreferences;
  onComplete: (
    updatedUser: UserAccount,
    updatedPrefs: Partial<UserPreferences>,
    importedTracks?: Track[],
    importedPlaylists?: PlaylistItem[],
  ) => void;
}

type StepId = 'apps' | 'identity' | 'genres' | 'notifications';

const STEP_ITEMS: PillTabItem<StepId>[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'identity', label: 'Profile' },
  { id: 'genres', label: 'Genres' },
  { id: 'notifications', label: 'Alerts' },
];

const STEP_ORDER: StepId[] = ['apps', 'identity', 'genres', 'notifications'];

const STREAMING_APPS: Array<{
  provider: ConnectedAppProvider;
  label: string;
  placeholder: string;
  accent: string;
}> = [
  {
    provider: 'spotify',
    label: 'Spotify',
    placeholder: 'Paste Spotify profile or playlist link / username',
    accent: '#1DB954',
  },
  {
    provider: 'audiomack',
    label: 'Audiomack',
    placeholder: 'Audiomack @handle or playlist URL',
    accent: '#FFA200',
  },
  {
    provider: 'soundcloud',
    label: 'SoundCloud',
    placeholder: 'SoundCloud username or track/playlist URL',
    accent: '#FF5500',
  },
  {
    provider: 'tunesimo',
    label: 'Tunesimo',
    placeholder: 'Tunesimo @handle or library link',
    accent: '#6366F1',
  },
];

const GENRE_OPTIONS = [
  'Trap',
  'R&B',
  'Pop',
  'Opium',
  'Hip-Hop',
  'Afrobeats',
  'UK / NY Drill',
  'Amapiano',
  'Rage / Underground',
  'Melodic Rap',
  'Electronic',
  'Alternative',
  'Dancehall',
  'Soul',
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  user,
  onComplete,
}) => {
  const [step, setStep] = useState<StepId>('apps');

  // Step 1: Connected Streaming Apps
  const [connectedApps, setConnectedApps] = useState<
    Partial<Record<ConnectedAppProvider, ConnectedAppEntry>>
  >(user.connectedApps ?? {});
  const [appInputs, setAppInputs] = useState<Record<ConnectedAppProvider, string>>({
    spotify: user.connectedApps?.spotify?.handleOrId ?? '',
    audiomack: user.connectedApps?.audiomack?.handleOrId ?? '',
    soundcloud: user.connectedApps?.soundcloud?.handleOrId ?? '',
    tunesimo: user.connectedApps?.tunesimo?.handleOrId ?? '',
  });
  const [syncingProvider, setSyncingProvider] = useState<ConnectedAppProvider | null>(null);
  const [importedTracks, setImportedTracks] = useState<Track[]>([]);
  const [importedPlaylists, setImportedPlaylists] = useState<PlaylistItem[]>([]);

  // Step 2: Identity Setup
  const [displayName, setDisplayName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user.avatarUrl);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Step 3: Genres
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(
    user.favoriteGenres.length > 0 ? user.favoriteGenres : ['Trap', 'R&B', 'Hip-Hop'],
  );

  // Step 4: Real Device Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false,
  );
  const [notifStatus, setNotifStatus] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'Enable alerts for new drops and synced Listen Parties.';
    }
    if (Notification.permission === 'granted') return 'Device notifications are active.';
    if (Notification.permission === 'denied') return 'Notifications blocked in browser settings.';
    return 'Tap below to allow real device notifications.';
  });

  const stepIndex = STEP_ORDER.indexOf(step);
  const progressPct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);
  const previewInitials = computeInitials(displayName || user.name);

  const handleConnectProvider = async (provider: ConnectedAppProvider) => {
    const raw = appInputs[provider] || user.handle;
    setSyncingProvider(provider);
    try {
      const result = await connectAndSyncExternalApp(provider, raw);
      setConnectedApps((prev) => ({ ...prev, [provider]: result.entry }));
      if (result.importedTracks.length > 0) {
        setImportedTracks((prev) => [...prev, ...result.importedTracks]);
      }
      if (result.importedPlaylist) {
        setImportedPlaylists((prev) => [result.importedPlaylist!, ...prev]);
      }
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose a PNG, JPG, or WebP image.');
      return;
    }
    try {
      setPhotoError(null);
      const compressed = await compressAvatarFile(file);
      setAvatarUrl(compressed);
    } catch {
      setPhotoError('Could not process that image.');
    }
  };

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) =>
      prev.includes(genre)
        ? prev.length > 1
          ? prev.filter((g) => g !== genre)
          : prev
        : [...prev, genre],
    );
  };

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      setNotificationsEnabled(true);
      setNotifStatus('Notifications enabled on this device.');
      void sendKlynNotification('KLYN Notifications Enabled', 'You will receive alerts for new drops and Listen Parties.');
    } else if (perm === 'denied') {
      setNotificationsEnabled(false);
      setNotifStatus('Browser notifications blocked — enable in browser permissions anytime.');
    } else {
      setNotificationsEnabled(false);
      setNotifStatus('Notification prompt dismissed. You can enable it later in Settings.');
    }
  };

  const finishOnboarding = (finalNotifications?: boolean) => {
    const cleanName = displayName.trim() || user.name;
    const rawHandle = handle.trim().replace(/^@+/, '').replace(/\s+/g, '');
    const cleanHandle = rawHandle
      ? `@${rawHandle}`
      : `@${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`;

    const resolvedNotifications =
      finalNotifications !== undefined ? finalNotifications : notificationsEnabled;

    const updatedUser: UserAccount = {
      ...user,
      name: cleanName,
      handle: cleanHandle,
      initials: previewInitials,
      avatarUrl,
      favoriteGenres,
      connectedApps,
      notificationsEnabled: resolvedNotifications,
      hasCompletedOnboarding: true,
    };

    onComplete(
      updatedUser,
      {
        notifyPushAlerts: resolvedNotifications,
        notifyNewReleases: resolvedNotifications,
        notifySocialInvites: resolvedNotifications,
      },
      importedTracks,
      importedPlaylists,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="KLYN Setup"
      className="fixed inset-0 z-[65] flex flex-col bg-[#000000] text-white overflow-hidden"
    >
      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-black/85 backdrop-blur-2xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <KlynLogo size={36} />
              <div>
                <p className="font-display text-base font-bold tracking-tight leading-none text-white">
                  KLYN
                </p>
                <p className="mt-1 text-[11px] font-medium text-white/50 tabular-nums">
                  Step {stepIndex + 1} of {STEP_ORDER.length} · {STEP_ITEMS[stepIndex].label}
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold text-white/60 tabular-nums">{progressPct}%</span>
          </div>

          <SpringPillTabs
            items={STEP_ITEMS}
            activeId={step}
            onChange={setStep}
            variant="equal"
            size="sm"
            ariaLabel="Setup steps"
            className="liquid-glass w-full p-1"
          />

          <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="glass-scroll relative z-10 flex-1 overflow-y-auto px-4 py-7 sm:py-10">
        <div className="mx-auto w-full max-w-3xl pb-6">
          {/* STEP 1: CONNECT YOUR APPS */}
          {step === 'apps' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                  Sync Libraries
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Connect your music apps
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Paste your profile or playlist link from Spotify, Audiomack, SoundCloud, or Tunesimo to import playlists and shape your feed.
                </p>
              </div>

              <div className="space-y-2.5">
                {STREAMING_APPS.map((app) => {
                  const status = connectedApps[app.provider];
                  const isSyncing = syncingProvider === app.provider;
                  const isConnected = Boolean(status?.connected);

                  return (
                    <div
                      key={app.provider}
                      className="liquid-glass rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: app.accent }}
                        />
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="text-sm font-semibold text-white shrink-0">{app.label}</p>
                          <p className="text-xs text-white/50 truncate">
                            {isConnected
                              ? status?.importedCount
                                ? `${status.importedCount} tracks synced`
                                : 'Connected'
                              : 'Not connected'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[290px]">
                        <div className="relative flex-1 min-w-0">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                          <input
                            type="text"
                            value={appInputs[app.provider]}
                            onChange={(e) =>
                              setAppInputs((prev) => ({ ...prev, [app.provider]: e.target.value }))
                            }
                            placeholder={app.placeholder}
                            className="w-full min-h-[38px] rounded-full bg-white/[0.07] border border-white/14 pl-8 pr-3 text-xs text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={() => void handleConnectProvider(app.provider)}
                          className={`min-h-[38px] shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-transform active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 ${
                            isConnected
                              ? 'bg-emerald-500/20 border border-emerald-400/35 text-emerald-300'
                              : 'bg-white text-black hover:scale-[1.02]'
                          }`}
                        >
                          {isSyncing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Syncing…</span>
                            </>
                          ) : isConnected ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Synced</span>
                            </>
                          ) : (
                            <span>Connect</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep('identity')}
                  className="text-xs font-semibold text-white/60 hover:text-white transition-colors"
                >
                  Set up later →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: IDENTITY SETUP */}
          {step === 'identity' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                  Your Profile
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Set up your KLYN identity
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Choose a profile photo, display name, and handle so friends can find you for Blends and Listen Parties.
                </p>
              </div>

              <div className="liquid-glass-elevated rounded-[30px] p-6 sm:p-8 flex flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <UserAvatar
                    name={displayName || 'Listener'}
                    initials={previewInitials}
                    avatarUrl={avatarUrl}
                    sizeClass="h-28 w-28"
                    textClass="text-3xl"
                    glow
                  />

                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black shadow-lg hover:scale-[1.02] active:scale-95 transition-transform">
                      <Camera className="h-3.5 w-3.5" />
                      <span>{avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarFileChange}
                        className="sr-only"
                      />
                    </label>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl(undefined)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/[0.08] border border-white/14 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  {photoError && <p className="text-xs text-rose-300">{photoError}</p>}
                </div>

                <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="onb-name" className="block text-xs font-medium text-white/65 mb-1.5">
                      Display Name
                    </label>
                    <input
                      id="onb-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full min-h-[44px] rounded-2xl bg-white/[0.07] border border-white/15 px-3.5 text-sm text-white focus:border-white/40 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="onb-handle" className="block text-xs font-medium text-white/65 mb-1.5">
                      @handle
                    </label>
                    <input
                      id="onb-handle"
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="@listener"
                      className="w-full min-h-[44px] rounded-2xl bg-white/[0.07] border border-white/15 px-3.5 text-sm text-white focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MUSIC GENRE SELECTION */}
          {step === 'genres' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                  Taste Tuning
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  What sounds do you rotate?
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Pick the genres you play most so your Home shelves, Hero recommendations, and Reels start locked in.
                </p>
              </div>

              <div className="liquid-glass-elevated rounded-[30px] p-5 sm:p-7 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Select one or more</span>
                  </span>
                  <span className="text-xs font-semibold text-white/60 tabular-nums">
                    {favoriteGenres.length} selected
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {GENRE_OPTIONS.map((genre) => {
                    const active = favoriteGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => toggleGenre(genre)}
                        className={`spring-card inline-flex min-h-[42px] items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold ${
                          active
                            ? 'bg-white text-black shadow-lg'
                            : 'bg-white/[0.07] border border-white/12 text-white/85 hover:bg-white/14'
                        }`}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        <span>{genre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REAL DEVICE NOTIFICATIONS */}
          {step === 'notifications' && (
            <div className="space-y-6 max-w-2xl mx-auto text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 border border-white/16 shadow-xl">
                <Bell className="h-7 w-7 text-white" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                  Device Alerts
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Turn on real notifications
                </h1>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">
                  Get instant alerts when artists you follow drop new music or a friend invites you to a synced Listen Party.
                </p>
              </div>

              <div className="liquid-glass-elevated rounded-[30px] p-6 space-y-4">
                <p className="text-xs font-medium text-white/75">{notifStatus}</p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleEnableNotifications()}
                    className="min-h-[46px] w-full sm:w-auto rounded-full bg-white px-7 py-3 text-sm font-semibold text-black shadow-xl hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    {notificationsEnabled ? 'Notifications Enabled' : 'Turn On Notifications'}
                  </button>
                  <button
                    type="button"
                    onClick={() => finishOnboarding(false)}
                    className="min-h-[46px] w-full sm:w-auto rounded-full bg-white/[0.08] border border-white/15 px-7 py-3 text-sm font-semibold text-white/80 hover:bg-white/14"
                  >
                    Not Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-black/80 backdrop-blur-2xl px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])}
            className="liquid-glass inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/14 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          {stepIndex < STEP_ORDER.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(STEP_ORDER[stepIndex + 1])}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-6 py-2.5 text-xs sm:text-sm font-semibold text-black shadow-lg hover:scale-[1.02] active:scale-95 transition-transform"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => finishOnboarding()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-7 py-2.5 text-xs sm:text-sm font-semibold text-black shadow-xl hover:scale-[1.02] active:scale-95 transition-transform"
            >
              <Check className="h-4 w-4" />
              <span>Start Listening</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
