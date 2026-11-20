import React, { useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Camera,
  Check,
  Disc3,
  Eye,
  Flame,
  Headphones,
  Layers,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AvatarStyle, UserAccount, UserPreferences } from '../types/music';
import { compressAvatarFile, computeInitials } from '../utils/avatarImage';
import { BrandLogo } from './BrandLogo';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';
import { UserAvatar } from './UserAvatar';

interface OnboardingFlowProps {
  user: UserAccount;
  preferences: UserPreferences;
  isReplay?: boolean;
  onCancelReplay?: () => void;
  onComplete: (updatedUser: UserAccount, updatedPrefs: Partial<UserPreferences>) => void;
}

type StepId = 'welcome' | 'profile' | 'notifications' | 'defaults';

const STEP_ITEMS: PillTabItem<StepId>[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'profile', label: 'Identity' },
  { id: 'notifications', label: 'Alerts' },
  { id: 'defaults', label: 'Sound' },
];

const STEP_ORDER: StepId[] = ['welcome', 'profile', 'notifications', 'defaults'];

const GENRE_OPTIONS = [
  'Electronic',
  'Spatial',
  'Alt-R&B',
  'Lo-Fi',
  'Ambient',
  'Neo-Soul',
  'House',
  'Indie',
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

const OnboardingToggle: React.FC<{
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

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  user,
  preferences,
  isReplay = false,
  onCancelReplay,
  onComplete,
}) => {
  const [step, setStep] = useState<StepId>('welcome');

  // Step 2: Profile & Taste state
  const [displayName, setDisplayName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [customInitials, setCustomInitials] = useState(user.initials);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user.avatarUrl);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(user.avatarStyle ?? 'monogram');
  const [accentColor, setAccentColor] = useState(user.accentColor ?? '#C27838');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(
    user.favoriteGenres.length > 0 ? user.favoriteGenres : ['Electronic', 'Spatial', 'Alt-R&B'],
  );
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Step 3: Notification state
  const [notifyNewReleases, setNotifyNewReleases] = useState(preferences.notifyNewReleases);
  const [notifySocialInvites, setNotifySocialInvites] = useState(preferences.notifySocialInvites);
  const [notifyStreakAlerts, setNotifyStreakAlerts] = useState(preferences.notifyStreakAlerts);
  const [browserPermStatus, setBrowserPermStatus] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'In-app Liquid Glass alerts active';
    }
    if (Notification.permission === 'granted') return 'Push notifications enabled';
    if (Notification.permission === 'denied') return 'Using in-app alerts';
    return 'Tap Allow to enable system alerts';
  });

  // Step 4: Playback & Privacy defaults
  const [losslessSpatial, setLosslessSpatial] = useState(
    preferences.streamingQuality === 'Lossless' && preferences.spatialEnabled,
  );
  const [autoScrollLyrics, setAutoScrollLyrics] = useState(preferences.autoScrollLyrics);
  const [listeningVisibility, setListeningVisibility] = useState(preferences.listeningVisibility);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progressPct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);
  const previewInitials = (customInitials.trim() || computeInitials(displayName))
    .slice(0, 2)
    .toUpperCase();

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) =>
      prev.includes(genre)
        ? prev.length > 1
          ? prev.filter((g) => g !== genre)
          : prev
        : [...prev, genre],
    );
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

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermStatus('In-app Liquid Glass alerts active');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        setBrowserPermStatus('Push notifications enabled');
      } else {
        setBrowserPermStatus('Using in-app Liquid Glass alerts');
      }
    } catch {
      setBrowserPermStatus('Using in-app Liquid Glass alerts');
    }
  };

  const handleFinish = () => {
    const cleanName = displayName.trim() || user.name;
    const rawHandle = handle.trim().replace(/^@+/, '').replace(/\s+/g, '');
    const cleanHandle = rawHandle
      ? `@${rawHandle}`
      : `@${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`;

    const updatedUser: UserAccount = {
      ...user,
      name: cleanName,
      handle: cleanHandle,
      initials: previewInitials,
      avatarUrl,
      avatarStyle,
      accentColor,
      favoriteGenres,
      hasCompletedOnboarding: true,
    };

    const updatedPrefs: Partial<UserPreferences> = {
      notifyNewReleases,
      notifySocialInvites,
      notifyStreakAlerts,
      notifyPushAlerts: browserPermStatus.includes('enabled'),
      streamingQuality: losslessSpatial ? 'Lossless' : 'High',
      spatialEnabled: losslessSpatial,
      autoScrollLyrics,
      listeningVisibility,
      privateSession: !listeningVisibility,
    };

    onComplete(updatedUser, updatedPrefs);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="klyn Onboarding"
      className="fixed inset-0 z-[65] flex flex-col bg-[#000000] text-white overflow-hidden"
    >
      {/* Dynamic Accent Ambient Field */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="animate-orb-a absolute -left-28 top-[4%] h-[28rem] w-[28rem] rounded-full opacity-35 blur-[140px] transition-colors duration-700"
          style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 72%)` }}
        />
        <div
          className="animate-orb-b absolute -right-24 bottom-[8%] h-[26rem] w-[26rem] rounded-full opacity-24 blur-[140px]"
          style={{ background: 'radial-gradient(circle, #2B78B8 0%, transparent 74%)' }}
        />
      </div>

      {/* Floating Refined Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-black/70 backdrop-blur-2xl px-4 pt-4 pb-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-9 w-9 rounded-xl border border-white/18 shadow-md" />
              <div>
                <p className="font-display text-base font-bold tracking-tight leading-none text-white">
                  klyn
                </p>
                <p className="mt-1 text-[11px] font-medium text-white/50 tabular-nums">
                  Step {stepIndex + 1} of {STEP_ORDER.length} · {STEP_ITEMS[stepIndex].label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white/60 tabular-nums">
                {progressPct}%
              </span>
              {isReplay && onCancelReplay && (
                <button
                  type="button"
                  onClick={onCancelReplay}
                  aria-label="Close replay onboarding"
                  className="liquid-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/14 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Close</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <SpringPillTabs
              items={STEP_ITEMS}
              activeId={step}
              onChange={setStep}
              variant="equal"
              size="sm"
              ariaLabel="Onboarding steps"
              className="liquid-glass w-full p-1"
            />
          </div>

          <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${accentColor}, #ffffff)`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Scrollable Step Canvas */}
      <main className="glass-scroll relative z-10 flex-1 overflow-y-auto px-4 py-7 sm:py-10">
        <div className="mx-auto w-full max-w-4xl pb-6">
          {/* STEP 1: WELCOME */}
          {step === 'welcome' && (
            <div className="space-y-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-[0.14em] uppercase text-white/50">
                  Personal Soundstage Setup
                </p>
                <h1 className="font-display mt-2 text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.08]">
                  Welcome to klyn, {user.name.split(' ')[0]}.
                </h1>
                <p className="mt-3 text-sm sm:text-base text-white/65 leading-relaxed">
                  Pure pitch-black Liquid Glass engineered around spatial fidelity, real-time synced lyrics, offline app downloads, and effortless discovery.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: Layers,
                    title: 'Dynamic Discovery Shelves',
                    desc: 'Quick Pics, Albums for You, Made for You, and artist rows shaped live from what you listen to.',
                  },
                  {
                    icon: Disc3,
                    title: 'Full-Screen Stage & Synced Lyrics',
                    desc: 'Refractive glass album frame with spring play/pause motion and tap-to-seek lyrics.',
                  },
                  {
                    icon: ArrowDownToLine,
                    title: 'Offline App Downloads',
                    desc: 'Save tracks or entire playlists straight into your klyn Downloads tab for instant offline access.',
                  },
                  {
                    icon: Activity,
                    title: 'Wrapped, Stories & Listen Party',
                    desc: 'Live streaks, Instagram Story share cards, Klyn AI Blends, and synced Listen Parties.',
                  },
                ].map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="liquid-glass-elevated relative overflow-hidden rounded-[28px] p-5 sm:p-6 flex items-start gap-4"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-display text-base sm:text-lg font-bold text-white">
                          {feature.title}
                        </h2>
                        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-white/60">
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: IDENTITY & TASTE */}
          {step === 'profile' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] uppercase text-white/50">
                  Identity &amp; Taste
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Make klyn unmistakably yours
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Upload a profile picture, pick your glass halo, and choose genres to tune your Home feed.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
                {/* Left: Live Listener Card Preview */}
                <div className="liquid-glass-elevated relative overflow-hidden rounded-[30px] p-6 flex flex-col items-center justify-between text-center gap-5">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-12 inset-x-0 mx-auto h-36 w-36 rounded-full opacity-35 blur-3xl transition-colors duration-500"
                    style={{ backgroundColor: accentColor }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3.5 w-full">
                    <UserAvatar
                      name={displayName || 'Listener'}
                      initials={previewInitials}
                      avatarUrl={avatarUrl}
                      avatarStyle={avatarStyle}
                      accentColor={accentColor}
                      sizeClass="h-24 w-24"
                      textClass="text-2xl"
                      glow
                    />
                    <div className="min-w-0 w-full">
                      <p className="font-display truncate text-xl font-bold text-white">
                        {displayName.trim() || 'Listener'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/55">
                        {handle.trim() || '@klyn.listener'}
                      </p>
                      <p className="mt-2 truncate text-[11px] font-medium text-white/50">
                        {favoriteGenres.slice(0, 3).join(' · ')}
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 flex w-full flex-col gap-2">
                    <label className="flex min-h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg hover:scale-[1.01] active:scale-95 transition-transform">
                      <Camera className="h-3.5 w-3.5" />
                      <span>{avatarUrl ? 'Change Profile Photo' : 'Upload Profile Photo'}</span>
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
                        className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-full bg-white/[0.08] border border-white/14 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/14 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove Photo</span>
                      </button>
                    )}
                    {photoError && <p className="text-[11px] text-rose-300">{photoError}</p>}
                  </div>
                </div>

                {/* Right: Identity Form + Avatar Frame & Accent Controls */}
                <div className="liquid-glass rounded-[30px] p-5 sm:p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label htmlFor="onb-name" className="block text-xs font-medium text-white/65 mb-1.5">
                        Display Name
                      </label>
                      <input
                        id="onb-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          setCustomInitials(computeInitials(e.target.value));
                        }}
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
                        className="w-full min-h-[44px] rounded-2xl bg-white/[0.07] border border-white/15 px-3.5 text-sm text-white focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="onb-initials" className="block text-xs font-medium text-white/65 mb-1.5">
                        Initials
                      </label>
                      <input
                        id="onb-initials"
                        type="text"
                        maxLength={2}
                        value={customInitials}
                        onChange={(e) => setCustomInitials(e.target.value.toUpperCase())}
                        className="w-full min-h-[44px] rounded-2xl bg-white/[0.07] border border-white/15 px-3.5 text-center font-display text-sm font-bold uppercase text-white focus:border-white/40 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <p className="text-xs font-medium text-white/65 mb-2">Frame Style</p>
                      <div className="grid grid-cols-2 gap-2">
                        {AVATAR_STYLES.map((st) => {
                          const active = avatarStyle === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => setAvatarStyle(st.id)}
                              className={`min-h-[40px] rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                                active
                                  ? 'bg-white text-black'
                                  : 'bg-white/[0.06] border border-white/12 text-white/80 hover:bg-white/14'
                              }`}
                            >
                              {st.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-white/65 mb-2">Accent Halo</p>
                      <div className="flex flex-wrap gap-2">
                        {ACCENT_COLORS.map((color) => {
                          const active = accentColor === color.hex;
                          return (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setAccentColor(color.hex)}
                              aria-label={`Select ${color.name} accent`}
                              className={`inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                                active
                                  ? 'border-white bg-white/16 text-white'
                                  : 'border-white/12 bg-white/[0.05] text-white/70 hover:bg-white/12'
                              }`}
                            >
                              <span
                                className="h-3.5 w-3.5 rounded-full border border-white/25"
                                style={{ backgroundColor: color.hex }}
                              />
                              <span>{color.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Favorite Genres */}
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-medium text-white/65">Favorite Genres &amp; Moods</p>
                      <span className="text-xs font-semibold text-white/60 tabular-nums">
                        {favoriteGenres.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {GENRE_OPTIONS.map((genre) => {
                        const active = favoriteGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => toggleGenre(genre)}
                            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                              active
                                ? 'bg-white text-black shadow-md'
                                : 'bg-white/[0.06] border border-white/12 text-white/80 hover:bg-white/14'
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
              </div>
            </div>
          )}

          {/* STEP 3: ALERTS & SYNC */}
          {step === 'notifications' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] uppercase text-white/50">
                  Live Alerts
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Stay in sync on drops &amp; sessions
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Control release alerts, Listen Party invites, and daily listening streak reminders.
                </p>
              </div>

              <div className="liquid-glass-elevated divide-y divide-white/[0.08] rounded-[30px] px-5 sm:px-6">
                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <BellRing className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Followed Artist Drops</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        New singles and albums from artists you follow
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={notifyNewReleases}
                    onToggle={() => setNotifyNewReleases((v) => !v)}
                    label="Followed Artist Drops"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Users className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Blend &amp; Listen Party Invites</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        Instant pop-ups for synced listening rooms and AI Blends
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={notifySocialInvites}
                    onToggle={() => setNotifySocialInvites((v) => !v)}
                    label="Blend and Listen Party Invites"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Flame className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Daily Streak Nudges</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        Gentle reminders before midnight to keep your streak alive
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={notifyStreakAlerts}
                    onToggle={() => setNotifyStreakAlerts((v) => !v)}
                    label="Daily Streak Nudges"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-5">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Bell className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">System Push Permission</p>
                      <p className="text-xs text-white/55 mt-0.5">{browserPermStatus}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestBrowserPermission}
                    className="min-h-[40px] shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    Allow Notifications
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SOUND & PRIVACY */}
          {step === 'defaults' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] uppercase text-white/50">
                  Audio Engine
                </p>
                <h1 className="font-display mt-1.5 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  Tune playback &amp; privacy
                </h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Configure your default soundstage fidelity before entering klyn.
                </p>
              </div>

              <div className="liquid-glass-elevated divide-y divide-white/[0.08] rounded-[30px] px-5 sm:px-6">
                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Headphones className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Lossless &amp; Spatial Audio</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        Hi-Res Lossless streaming with Dolby Atmos spatial staging
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={losslessSpatial}
                    onToggle={() => setLosslessSpatial((v) => !v)}
                    label="Lossless and Spatial Audio"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Sparkles className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Auto-Scroll Synced Lyrics</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        Follow active lyrics automatically inside the player
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={autoScrollLyrics}
                    onToggle={() => setAutoScrollLyrics((v) => !v)}
                    label="Auto-Scroll Synced Lyrics"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/14">
                      <Eye className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Friend Activity Sharing</p>
                      <p className="text-xs text-white/55 mt-0.5">
                        Share currently playing tracks with friends for Blends
                      </p>
                    </div>
                  </div>
                  <OnboardingToggle
                    checked={listeningVisibility}
                    onToggle={() => setListeningVisibility((v) => !v)}
                    label="Friend Activity Sharing"
                  />
                </div>
              </div>

              {/* Ready Summary */}
              <div className="liquid-glass rounded-[28px] p-4 sm:p-5 flex items-center gap-4">
                <UserAvatar
                  name={displayName || user.name}
                  initials={previewInitials}
                  avatarUrl={avatarUrl}
                  avatarStyle={avatarStyle}
                  accentColor={accentColor}
                  sizeClass="h-14 w-14"
                  textClass="text-base"
                  glow
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-white truncate">
                    {displayName.trim() || user.name} · {handle.trim() || user.handle}
                  </p>
                  <p className="text-xs text-white/60 truncate mt-0.5">
                    {losslessSpatial ? 'Lossless · Spatial Audio' : 'High Quality · Stereo'} ·{' '}
                    {favoriteGenres.slice(0, 3).join(' · ')}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black">
                  <Check className="h-4 w-4" />
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Floating Action Footer */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-black/80 backdrop-blur-2xl px-4 py-4">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
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
              onClick={handleFinish}
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
