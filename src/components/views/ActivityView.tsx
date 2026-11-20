import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Check,
  Clock,
  Disc3,
  FileText,
  Heart,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Share2,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ArtistPlayStat, formatDurationSummary, formatTime } from '../../data/catalog';
import { fetchRealArtistPhoto, getCachedArtistPhoto } from '../../services/artistProfiles';
import {
  ActivityPeriod,
  ListenPartyMessage,
  ListeningLogEntry,
  ListeningStatsState,
  SocialUser,
  Track,
  UserAccount,
} from '../../types/music';
import { searchPublicProfilesFromFirestore } from '../../utils/firestoreSync';
import { CoverArt } from '../CoverArt';
import { MusicReceiptModal } from '../MusicReceiptModal';
import { PillTabItem, SpringPillTabs } from '../SpringPillTabs';
import { StoryShareModal } from '../StoryShareModal';

type ActivitySubPage = 'My Activity' | 'Friends & Social';

interface AiWrappedSummary {
  headline: string;
  persona: string;
  summary: string;
  vibeTags: string[];
  source: string;
}

interface ActivityViewProps {
  tracks: Track[];
  currentUser: UserAccount;
  listeningStats: ListeningStatsState;
  recentLog: ListeningLogEntry[];
  favoriteIds: Set<string>;
  downloadedTrackIds?: Set<string>;
  activeTrackId: string;
  activeTrack: Track | null;
  isPlaying: boolean;
  socialUsers: SocialUser[];
  partyMessages: ListenPartyMessage[];
  activePartyFriend: SocialUser | null;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onToggleFriend: (userId: string) => void;
  onAddCustomFriend: (nameOrHandle: string, prebuilt?: SocialUser) => void;
  onReactToFriend: (userId: string, reaction: string) => void;
  onRequestListenPartyPopup: (friend: SocialUser) => void;
  onRequestBlendPopup: (friend: SocialUser) => void;
  onEndListenParty: () => void;
  onSwitchPartyTrack: (track: Track, actorName: string) => void;
  onSendPartyMessage: (text: string) => void;
  onSaveBlendPlaylist: (friend: SocialUser, trackIds: string[], matchPct: number) => void;
  onSubPageChange?: () => void;
}

const SUB_TABS: PillTabItem<ActivitySubPage>[] = [
  { id: 'My Activity', label: 'My Activity' },
  { id: 'Friends & Social', label: 'Friends & Social' },
];

const PERIOD_TABS: PillTabItem<ActivityPeriod>[] = [
  { id: 'This Week', label: 'This Week' },
  { id: '30 Days', label: '30 Days' },
  { id: 'All Time', label: 'All Time' },
];

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function getMonSunLabel(date: Date): (typeof WEEKDAY_ORDER)[number] {
  const jsDay = date.getDay();
  const idx = jsDay === 0 ? 6 : jsDay - 1;
  return WEEKDAY_ORDER[idx];
}

export const ActivityView: React.FC<ActivityViewProps> = ({
  tracks,
  currentUser,
  listeningStats,
  recentLog,
  favoriteIds,
  downloadedTrackIds: _downloadedTrackIds,
  activeTrackId,
  activeTrack,
  isPlaying,
  socialUsers,
  partyMessages,
  activePartyFriend,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onOpenArtist,
  onOpenAddToPlaylist,
  onToggleFriend,
  onAddCustomFriend,
  onReactToFriend,
  onRequestListenPartyPopup,
  onRequestBlendPopup,
  onEndListenParty,
  onSwitchPartyTrack,
  onSendPartyMessage,
  onSaveBlendPlaylist,
  onSubPageChange,
}) => {
  const [subPage, setSubPage] = useState<ActivitySubPage>('My Activity');
  const [period, setPeriod] = useState<ActivityPeriod>('This Week');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [selectedArtistStatName, setSelectedArtistStatName] = useState<string | null>(null);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const [aiWrapped, setAiWrapped] = useState<AiWrappedSummary | null>(null);
  const [isLoadingWrapped, setIsLoadingWrapped] = useState(false);

  // Friends & Social state
  const [userSearch, setUserSearch] = useState('');
  const [remotePublicUsers, setRemotePublicUsers] = useState<SocialUser[]>([]);
  const [isSearchingDirectory, setIsSearchingDirectory] = useState(false);
  const [partyInput, setPartyInput] = useState('');
  const [partyControlAsFriend, setPartyControlAsFriend] = useState(false);
  const [selectedBlendFriendId, setSelectedBlendFriendId] = useState<string>(
    socialUsers[0]?.id ?? '',
  );

  const trackById = useMemo(() => {
    const map = new Map<string, Track>();
    tracks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tracks]);

  const artistCoverMap = useMemo(() => {
    const map = new Map<string, string>();
    tracks.forEach((t) => {
      if (!map.has(t.artist) && t.coverUrl) {
        map.set(t.artist, t.coverUrl);
      }
    });
    return map;
  }, [tracks]);

  const computedActivity = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const daysWindow = period === 'This Week' ? 7 : period === '30 Days' ? 30 : null;
    const cutoffTs = daysWindow ? now - daysWindow * dayMs : 0;

    const dayTotals: Record<string, number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    };
    let totalMinutes = 0;

    const dateEntries = Object.entries(listeningStats.dailyMinutesByDate ?? {});
    if (dateEntries.length > 0) {
      dateEntries.forEach(([dateKey, mins]) => {
        if (typeof mins !== 'number' || mins <= 0) return;
        const parsed = new Date(`${dateKey}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return;
        if (daysWindow) {
          const diffDays = (now - parsed.getTime()) / dayMs;
          if (diffDays > daysWindow || diffDays < -1) return;
        }
        const label = getMonSunLabel(parsed);
        dayTotals[label] += mins;
        totalMinutes += mins;
      });
    } else if (
      Array.isArray(listeningStats.dailyMinutes) &&
      listeningStats.dailyMinutes.length === 7
    ) {
      listeningStats.dailyMinutes.forEach((m, i) => {
        const val = typeof m === 'number' && m > 0 ? m : 0;
        dayTotals[WEEKDAY_ORDER[i]] += val;
        totalMinutes += val;
      });
    }

    const dailyBars = WEEKDAY_ORDER.map((day) => ({
      day,
      minutes: Math.round(dayTotals[day]),
    }));

    const eventsInPeriod = (listeningStats.playEvents ?? []).filter(
      (ev) => !cutoffTs || ev.ts >= cutoffTs,
    );

    let tracksPlayed = eventsInPeriod.length;
    const artistAgg = new Map<
      string,
      { plays: number; seconds: number; trackPlays: Record<string, number> }
    >();
    const songAgg = new Map<string, { plays: number; seconds: number }>();

    if (eventsInPeriod.length > 0) {
      eventsInPeriod.forEach((ev) => {
        const curArt = artistAgg.get(ev.artist) ?? {
          plays: 0,
          seconds: 0,
          trackPlays: {},
        };
        curArt.plays += 1;
        curArt.seconds += ev.seconds > 0 ? ev.seconds : 180;
        curArt.trackPlays[ev.trackId] = (curArt.trackPlays[ev.trackId] ?? 0) + 1;
        artistAgg.set(ev.artist, curArt);

        const curSong = songAgg.get(ev.trackId) ?? { plays: 0, seconds: 0 };
        curSong.plays += 1;
        curSong.seconds += ev.seconds > 0 ? ev.seconds : 180;
        songAgg.set(ev.trackId, curSong);
      });
      if (totalMinutes === 0) {
        totalMinutes = Math.round(
          eventsInPeriod.reduce((acc, ev) => acc + (ev.seconds > 0 ? ev.seconds : 180), 0) / 60,
        );
      }
    } else {
      const countValues = Object.values(listeningStats.trackPlayCounts ?? {});
      const lifetimeTracks = countValues.reduce((sum, n) => sum + n, 0);
      tracksPlayed = lifetimeTracks;

      Object.entries(listeningStats.trackPlayCounts ?? {}).forEach(([trackId, count]) => {
        if (count <= 0) return;
        const found = trackById.get(trackId);
        const artistName = found?.artist ?? 'Unknown Artist';
        const secPerPlay = Math.max(120, Math.round(found?.duration ?? 180));
        const curArt = artistAgg.get(artistName) ?? {
          plays: 0,
          seconds: 0,
          trackPlays: {},
        };
        curArt.plays += count;
        curArt.seconds += count * secPerPlay;
        curArt.trackPlays[trackId] = (curArt.trackPlays[trackId] ?? 0) + count;
        artistAgg.set(artistName, curArt);
        songAgg.set(trackId, { plays: count, seconds: count * secPerPlay });
      });

      Object.entries(listeningStats.artistPlayCounts ?? {}).forEach(([artistName, count]) => {
        if (count <= 0 || artistAgg.has(artistName)) return;
        artistAgg.set(artistName, {
          plays: count,
          seconds: count * 180,
          trackPlays: {},
        });
      });

      if (totalMinutes === 0 && tracksPlayed > 0) {
        totalMinutes = Math.round(
          Array.from(artistAgg.values()).reduce((s, a) => s + a.seconds, 0) / 60,
        );
      }
    }

    const totalArtistPlays = Math.max(
      1,
      Array.from(artistAgg.values()).reduce((sum, item) => sum + item.plays, 0),
    );

    const artistStats: ArtistPlayStat[] = Array.from(artistAgg.entries())
      .map(([artistName, info]) => {
        let bestTrackId = '';
        let bestTrackPlays = 0;
        Object.entries(info.trackPlays).forEach(([tid, c]) => {
          if (c > bestTrackPlays) {
            bestTrackId = tid;
            bestTrackPlays = c;
          }
        });
        return {
          artistName,
          plays: info.plays,
          minutes: Math.max(1, Math.round(info.seconds / 60)),
          sharePct: Math.max(1, Math.round((info.plays / totalArtistPlays) * 100)),
          topTrackId: bestTrackId,
          topTrackPlays: bestTrackPlays || info.plays,
        };
      })
      .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes);

    const songStats = Array.from(songAgg.entries())
      .map(([trackId, info]) => {
        const track = trackById.get(trackId);
        if (!track) return null;
        return {
          track,
          plays: info.plays,
          minutes: Math.max(1, Math.round(info.seconds / 60)),
        };
      })
      .filter((item): item is { track: Track; plays: number; minutes: number } => Boolean(item))
      .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes);

    const leadArtist = artistStats[0] ?? null;
    const topTrack =
      songStats[0]?.track ??
      (leadArtist?.topTrackId ? trackById.get(leadArtist.topTrackId) : undefined) ??
      (recentLog[0] ? trackById.get(recentLog[0].trackId) : undefined) ??
      null;

    return {
      totalMinutes: Math.round(totalMinutes),
      totalTime: formatDurationSummary(totalMinutes),
      tracksPlayed,
      dailyBars,
      artistStats,
      songStats,
      topArtistName: leadArtist?.artistName ?? (topTrack?.artist ?? 'No Top Artist Yet'),
      topArtistPlays: leadArtist?.plays ?? 0,
      topArtistMinutes: leadArtist?.minutes ?? 0,
      topTrack,
      vibeLabel: topTrack ? `${topTrack.genre} Focus` : 'Ready to Play',
    };
  }, [listeningStats, period, recentLog, trackById]);

  // Fetch AI Klyn Wrapped insights from /api/gemini/wrapped
  const topArtistKey = computedActivity.artistStats
    .slice(0, 5)
    .map((a) => `${a.artistName}:${a.plays}`)
    .join('|');
  const topSongKey = computedActivity.songStats
    .slice(0, 5)
    .map((s) => `${s.track.title}:${s.plays}`)
    .join('|');
  const genresKey = currentUser.favoriteGenres.join('|');

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingWrapped(true);

    const topArtists = computedActivity.artistStats.slice(0, 5).map((a) => a.artistName);
    const topSongs = computedActivity.songStats
      .slice(0, 5)
      .map((s) => `${s.track.title} — ${s.track.artist}`);

    fetch('/api/gemini/wrapped', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topArtists,
        topSongs,
        favoriteGenres: currentUser.favoriteGenres,
        totalMinutes: computedActivity.totalMinutes,
        period,
      }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AiWrappedSummary | null) => {
        if (!controller.signal.aborted && data) {
          setAiWrapped(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingWrapped(false);
      });

    return () => controller.abort();
  }, [period, topArtistKey, topSongKey, genresKey, computedActivity.totalMinutes]);

  // Fetch real Deezer circular portraits for Most Played Artists
  useEffect(() => {
    if (computedActivity.artistStats.length === 0) return;
    let cancelled = false;
    computedActivity.artistStats.forEach((stat) => {
      const cached = getCachedArtistPhoto(stat.artistName);
      if (cached) {
        setArtistPhotos((prev) =>
          prev[stat.artistName] ? prev : { ...prev, [stat.artistName]: cached },
        );
        return;
      }
      const fallback = artistCoverMap.get(stat.artistName) ?? '';
      fetchRealArtistPhoto(stat.artistName, fallback).then((url) => {
        if (!cancelled && url) {
          setArtistPhotos((prev) => ({ ...prev, [stat.artistName]: url }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [computedActivity.artistStats, artistCoverMap]);

  // Debounced Firestore public directory lookup in Friends & Social
  useEffect(() => {
    if (subPage !== 'Friends & Social') return;
    const clean = userSearch.trim();
    if (clean.length < 1) {
      setRemotePublicUsers([]);
      setIsSearchingDirectory(false);
      return;
    }

    let cancelled = false;
    setIsSearchingDirectory(true);
    const timer = window.setTimeout(() => {
      searchPublicProfilesFromFirestore(clean, currentUser.uid)
        .then((rows) => {
          if (!cancelled) setRemotePublicUsers(rows);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsSearchingDirectory(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userSearch, subPage, currentUser.uid]);

  const maxMinutes = Math.max(...computedActivity.dailyBars.map((b) => b.minutes), 1);
  const topTrack = computedActivity.topTrack;
  const artistTracks = useMemo(
    () => tracks.filter((t) => t.artist === computedActivity.topArtistName),
    [tracks, computedActivity.topArtistName],
  );
  const isTopTrackPlaying = Boolean(topTrack && topTrack.id === activeTrackId && isPlaying);

  const activeArtistDetail =
    computedActivity.artistStats.find((s) => s.artistName === selectedArtistStatName) ?? null;
  const activeArtistTopSong =
    (activeArtistDetail?.topTrackId ? trackById.get(activeArtistDetail.topTrackId) : undefined) ??
    tracks.find((t) => t.artist === activeArtistDetail?.artistName) ??
    null;

  // Merge existing friends + live Firestore public_profiles directory (real users only)
  const availableUsers = useMemo(() => {
    const existingIds = new Set(socialUsers.map((u) => u.id));
    const existingHandles = new Set(socialUsers.map((u) => u.handle.toLowerCase()));
    const merged: SocialUser[] = [...socialUsers];

    for (const remote of remotePublicUsers) {
      if (!existingIds.has(remote.id) && !existingHandles.has(remote.handle.toLowerCase())) {
        existingIds.add(remote.id);
        existingHandles.add(remote.handle.toLowerCase());
        merged.push(remote);
      }
    }

    return merged;
  }, [socialUsers, remotePublicUsers]);

  const friends = useMemo(() => availableUsers.filter((u) => u.isFriend), [availableUsers]);
  const searchedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return friends;
    return availableUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
    );
  }, [availableUsers, friends, userSearch]);

  const blendFriend =
    availableUsers.find((u) => u.id === selectedBlendFriendId) ??
    friends[0] ??
    availableUsers[0] ??
    null;

  const blendTracks = useMemo(() => {
    const topPlayedIds = Object.entries(listeningStats.trackPlayCounts ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const liked = Array.from(favoriteIds);
    const userTopIds = Array.from(new Set([...topPlayedIds, ...liked])).slice(0, 6);
    const combinedIds = Array.from(
      new Set([...userTopIds, ...(blendFriend?.topTrackIds ?? [])]),
    );
    const matched = combinedIds
      .map((id) => trackById.get(id))
      .filter((t): t is Track => Boolean(t));
    if (matched.length > 0) return matched;
    return tracks.slice(0, 5);
  }, [listeningStats.trackPlayCounts, favoriteIds, blendFriend, trackById, tracks]);

  const activePlayingTrack = activeTrack ?? trackById.get(activeTrackId) ?? tracks[0] ?? null;

  const handlePartySend = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = partyInput.trim();
    if (!clean) return;
    onSendPartyMessage(clean);
    setPartyInput('');
  };

  return (
    <div className="space-y-6 pb-40">
      {/* Header + Sub-page Pill Switcher */}
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-white/55">Soundscape &amp; Social</p>
            <h1 className="font-display mt-0.5 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Activity
            </h1>
          </div>

          <SpringPillTabs
            items={SUB_TABS}
            activeId={subPage}
            onChange={(nextSub) => {
              setSubPage(nextSub);
              onSubPageChange?.();
            }}
            variant="hug"
            size="md"
            ariaLabel="Activity sections"
            className="liquid-glass-elevated p-1 self-start sm:self-auto"
          />
        </div>

        {subPage === 'My Activity' && (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <SpringPillTabs
              items={PERIOD_TABS}
              activeId={period}
              onChange={(nextPeriod) => {
                setPeriod(nextPeriod);
                setSelectedArtistStatName(null);
              }}
              variant="hug"
              size="sm"
              ariaLabel="Activity timeframe"
              className="liquid-glass p-1"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!topTrack}
                onClick={() => setIsStoryModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-45 disabled:pointer-events-none"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Story</span>
              </button>

              <button
                type="button"
                onClick={() => setIsReceiptOpen(true)}
                className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/12 transition-colors"
              >
                <FileText className="h-3.5 w-3.5 text-white/75" />
                <span>Summary</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= SUB-PAGE 1: COMPACT 4-SECTION MY ACTIVITY ================= */}
      {subPage === 'My Activity' && (
        <div className="space-y-6">
          {/* 1. AI Klyn Wrapped + Compact Listening Time / Plays / Mon-Sun Bar */}
          <section aria-label="AI Klyn Wrapped and listening overview" className="space-y-3.5">
            <div
              className="liquid-glass-elevated relative overflow-hidden rounded-3xl p-5"
              style={{
                background: `radial-gradient(circle at 88% 15%, ${
                  topTrack?.primaryColor ?? '#52525b'
                }45 0%, rgba(20,20,24,0.82) 55%, rgba(10,10,12,0.96) 100%)`,
              }}
            >
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] uppercase text-white/70">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Klyn Wrapped · {period}</span>
                    {isLoadingWrapped && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                    {aiWrapped?.headline || `${computedActivity.vibeLabel} Rotation`}
                  </h2>
                  <p className="text-xs sm:text-sm text-white/75 leading-relaxed max-w-2xl">
                    {aiWrapped?.summary ||
                      `You logged ${computedActivity.totalTime} across ${computedActivity.tracksPlayed} plays${
                        computedActivity.topArtistName !== 'No Top Artist Yet'
                          ? ` led by ${computedActivity.topArtistName}`
                          : ''
                      }.`}
                  </p>
                  {aiWrapped?.vibeTags && aiWrapped.vibeTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="rounded-full bg-white text-black px-2.5 py-0.5 text-[10px] font-bold">
                        {aiWrapped.persona}
                      </span>
                      {aiWrapped.vibeTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium text-white/80"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {topTrack && (
                  <div className="flex items-center gap-3 shrink-0">
                    <CoverArt
                      src={topTrack.coverUrl}
                      alt={topTrack.title}
                      fallbackGradient={topTrack.fallbackGradient}
                      className="h-16 w-16 rounded-2xl shadow-xl"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (topTrack.id === activeTrackId) onTogglePlay();
                        else onPlayTrack(topTrack, artistTracks.length ? artistTracks : tracks);
                      }}
                      aria-label={isTopTrackPlaying ? 'Pause top track' : 'Play top track'}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform"
                    >
                      {isTopTrackPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current translate-x-0.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Time + Plays KPIs (No Streaks) & Mon–Sun Daily Rhythm */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 lg:col-span-4">
                <div className="liquid-glass rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/55">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">Time Listened</span>
                  </div>
                  <p className="font-display mt-1 text-xl sm:text-2xl font-bold text-white tabular-nums truncate">
                    {computedActivity.totalTime}
                  </p>
                </div>

                <div className="liquid-glass rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/55">
                    <Activity className="h-3 w-3 shrink-0" />
                    <span className="truncate">Total Plays</span>
                  </div>
                  <p className="font-display mt-1 text-xl sm:text-2xl font-bold text-white tabular-nums">
                    {computedActivity.tracksPlayed.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="liquid-glass flex flex-col justify-between rounded-2xl p-4 lg:col-span-8">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-white">Daily Rhythm</h3>
                    <p className="text-[11px] text-white/55">Mon – Sun listening minutes</p>
                  </div>
                  {hoveredDay && (
                    <span className="text-xs font-semibold text-white/85 tabular-nums">
                      {hoveredDay} ·{' '}
                      {computedActivity.dailyBars.find((d) => d.day === hoveredDay)?.minutes ?? 0}m
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-7 items-end gap-2 sm:gap-3 h-24 sm:h-28 pt-2">
                  {computedActivity.dailyBars.map((bar) => {
                    const heightPct =
                      bar.minutes > 0
                        ? Math.max(16, Math.round((bar.minutes / maxMinutes) * 100))
                        : 10;
                    const isSelected = hoveredDay === bar.day;
                    return (
                      <button
                        key={`bar-${bar.day}`}
                        type="button"
                        onMouseEnter={() => setHoveredDay(bar.day)}
                        onFocus={() => setHoveredDay(bar.day)}
                        onClick={() => setHoveredDay(bar.day)}
                        className="group flex h-full flex-col items-center justify-end gap-1.5 focus:outline-none"
                      >
                        <div className="relative flex w-full max-w-[28px] flex-1 items-end rounded-full bg-white/[0.06] p-1">
                          <div
                            className={`w-full rounded-full transition-all duration-500 ${
                              bar.minutes === 0
                                ? 'bg-white/15'
                                : isSelected
                                  ? 'bg-white shadow-[0_0_14px_rgba(255,255,255,0.45)]'
                                  : 'bg-white/70 group-hover:bg-white'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-white/60">{bar.day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* 2. MOST LISTENED ARTISTS (#1 to last, Horizontal, Pure Borderless Circles) */}
          <section aria-label="Most listened artists">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Most Listened Artists
              </h2>
              <span className="text-xs text-white/50 tabular-nums">
                {computedActivity.artistStats.length > 0
                  ? `#1 – #${computedActivity.artistStats.length}`
                  : 'Builds from plays'}
              </span>
            </div>

            {computedActivity.artistStats.length === 0 ? (
              <div className="liquid-glass rounded-2xl p-5 text-center">
                <p className="text-xs font-semibold text-white">No played artists yet</p>
                <p className="mt-1 text-[11px] text-white/55">
                  Play any song to populate your ranked artists horizontally from #1 onward.
                </p>
              </div>
            ) : (
              <>
                <div className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto pb-1.5 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {computedActivity.artistStats.map((stat, idx) => {
                    const photoUrl =
                      artistPhotos[stat.artistName] ||
                      getCachedArtistPhoto(stat.artistName) ||
                      artistCoverMap.get(stat.artistName) ||
                      topTrack?.coverUrl ||
                      '';
                    const isSelected = activeArtistDetail?.artistName === stat.artistName;
                    return (
                      <button
                        key={`most-art-${stat.artistName}-${idx}`}
                        type="button"
                        onClick={() =>
                          setSelectedArtistStatName((cur) =>
                            cur === stat.artistName ? null : stat.artistName,
                          )
                        }
                        className="spring-card group flex w-24 shrink-0 snap-start flex-col items-center text-center focus:outline-none"
                      >
                        <div className="h-20 w-20 overflow-hidden rounded-full bg-zinc-900">
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={stat.artistName}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/75">
                              {stat.artistName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-[10px] font-bold text-white/55 tabular-nums">
                          #{idx + 1} · {stat.plays} {stat.plays === 1 ? 'play' : 'plays'}
                        </p>
                        <p
                          className={`mt-0.5 w-full truncate font-display text-xs font-bold ${
                            isSelected ? 'text-white underline' : 'text-white'
                          }`}
                        >
                          {stat.artistName}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {activeArtistDetail && (
                  <div className="mt-2.5 liquid-glass-elevated flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <CoverArt
                        src={
                          activeArtistTopSong?.coverUrl ??
                          artistCoverMap.get(activeArtistDetail.artistName) ??
                          ''
                        }
                        alt={activeArtistTopSong?.title ?? activeArtistDetail.artistName}
                        fallbackGradient={activeArtistTopSong?.fallbackGradient}
                        className="h-10 w-10 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                          <Award className="inline h-3 w-3 mr-1" />
                          {activeArtistDetail.artistName} · {activeArtistDetail.sharePct}% share
                        </p>
                        <p className="truncate text-sm font-bold text-white">
                          {activeArtistTopSong?.title ?? activeArtistDetail.artistName}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {activeArtistTopSong && (
                        <button
                          type="button"
                          onClick={() => {
                            if (activeArtistTopSong.id === activeTrackId) onTogglePlay();
                            else onPlayTrack(activeArtistTopSong, tracks);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
                        >
                          {activeArtistTopSong.id === activeTrackId && isPlaying ? (
                            <>
                              <Pause className="h-3 w-3 fill-current" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" />
                              <span>Play</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenArtist(activeArtistDetail.artistName)}
                        className="liquid-glass rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/14 transition-colors"
                      >
                        Profile
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 3. HORIZONTAL MOST LISTENED SONGS (#1 to last, Clean Uncluttered Artwork Cards) */}
          <section aria-label="Most listened songs">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Most Listened Songs
              </h2>
              <span className="text-xs text-white/50 tabular-nums">
                {computedActivity.songStats.length > 0
                  ? `#1 – #${computedActivity.songStats.length}`
                  : 'Waiting for plays'}
              </span>
            </div>

            {computedActivity.songStats.length === 0 ? (
              <div className="liquid-glass rounded-2xl p-5 text-center">
                <p className="text-xs font-semibold text-white">No listened songs yet</p>
                <p className="mt-1 text-[11px] text-white/55">
                  Your top tracks will scroll horizontally here from #1 onward.
                </p>
              </div>
            ) : (
              <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1.5 -mx-4 px-4 sm:mx-0 sm:px-0">
                {computedActivity.songStats.map((item, idx) => {
                  const isCurrent = item.track.id === activeTrackId;
                  return (
                    <button
                      key={`most-song-${item.track.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (isCurrent) {
                          if (!isPlaying) onTogglePlay();
                          onOpenPlayer();
                        } else {
                          onPlayTrack(
                            item.track,
                            computedActivity.songStats.map((s) => s.track),
                          );
                        }
                      }}
                      className={`spring-card group relative aspect-video w-60 sm:w-64 shrink-0 snap-start overflow-hidden rounded-2xl bg-zinc-950 text-left block ${
                        isCurrent ? 'ring-1 ring-white/55' : ''
                      }`}
                    >
                      <CoverArt
                        src={item.track.coverUrl}
                        alt={item.track.title}
                        fallbackGradient={item.track.fallbackGradient}
                        className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                      />
                      <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                        <p className="truncate text-sm font-bold text-white leading-tight">
                          #{idx + 1} · {item.track.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-white/75">
                          {item.track.artist} · {item.plays} {item.plays === 1 ? 'play' : 'plays'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. RECENTLY LISTENED PREVIEW */}
          <section aria-label="Recently listened preview">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Recently Listened
              </h2>
              <span className="text-xs text-white/50 tabular-nums">
                {Math.min(recentLog.length, 5)} recent{' '}
                {Math.min(recentLog.length, 5) === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {recentLog.length === 0 ? (
              <div className="liquid-glass rounded-2xl p-6 text-center">
                <p className="text-xs font-semibold text-white">Listening history is clear</p>
                <p className="mt-1 text-[11px] text-white/55">
                  Play any track to start building your live listening activity log.
                </p>
              </div>
            ) : (
              <div className="liquid-glass divide-y divide-white/[0.07] rounded-2xl px-2 sm:px-3.5">
                {recentLog.slice(0, 5).map((entry, idx) => {
                  const track = trackById.get(entry.trackId);
                  if (!track) return null;
                  const isCurrent = track.id === activeTrackId;

                  return (
                    <div
                      key={`log-${entry.id}-${idx}`}
                      className="flex items-center gap-3 py-2.5 px-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            if (!isPlaying) onTogglePlay();
                            onOpenPlayer();
                          } else {
                            onPlayTrack(track, tracks);
                          }
                        }}
                        className="relative shrink-0 rounded-lg"
                      >
                        <CoverArt
                          src={track.coverUrl}
                          alt={track.title}
                          fallbackGradient={track.fallbackGradient}
                          className="h-10 w-10 rounded-lg"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrent) {
                              if (!isPlaying) onTogglePlay();
                              onOpenPlayer();
                            } else {
                              onPlayTrack(track, tracks);
                            }
                          }}
                          className="block w-full truncate text-left text-sm font-semibold text-white hover:underline"
                        >
                          {track.title}
                        </button>
                        <div className="flex items-center gap-1.5 text-[11px] text-white/55 truncate">
                          <button
                            type="button"
                            onClick={() => onOpenArtist(track.artist)}
                            className="truncate hover:text-white hover:underline transition-colors"
                          >
                            {track.artist}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums shrink-0">{entry.playCount} plays</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">{entry.playedAtLabel}</span>
                        </div>
                      </div>

                      <span className="hidden sm:inline text-[11px] text-white/45 tabular-nums">
                        {formatTime(track.duration)}
                      </span>

                      <button
                        type="button"
                        onClick={() => onOpenAddToPlaylist(track)}
                        aria-label={`Add ${track.title} to playlist`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= SUB-PAGE 2: FRIENDS & SOCIAL ================= */}
      {subPage === 'Friends & Social' && (
        <div className="space-y-8">
          {/* Active Synced Listen Party Room */}
          {activePartyFriend && (
            <section aria-label="Active Listen Party">
              <div className="liquid-glass-elevated relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
                      <Radio className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                        Live Listen Party · Synced Playback
                      </p>
                      <h2 className="font-display text-lg font-bold text-white">
                        {currentUser.name.split(' ')[0]} + {activePartyFriend.name}
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onEndListenParty}
                    className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/15"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Leave Party</span>
                  </button>
                </div>

                {activePlayingTrack && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.07] border border-white/15 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CoverArt
                        src={activePlayingTrack.coverUrl}
                        alt={activePlayingTrack.title}
                        className="h-12 w-12 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {activePlayingTrack.title}
                        </p>
                        <p className="truncate text-xs text-white/60">
                          {activePlayingTrack.artist} · Listening in sync
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onTogglePlay}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black"
                      aria-label={isPlaying ? 'Pause party playback' : 'Play party playback'}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current translate-x-0.5" />
                      )}
                    </button>
                  </div>
                )}

                {tracks.length > 0 && (
                  <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                        Shared Control · Pick a Song for Both
                      </p>
                      <div className="flex items-center gap-1 rounded-full bg-white/[0.08] p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPartyControlAsFriend(false)}
                          className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                            !partyControlAsFriend ? 'bg-white text-black' : 'text-white/70'
                          }`}
                        >
                          As {currentUser.name.split(' ')[0]}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPartyControlAsFriend(true)}
                          className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                            partyControlAsFriend ? 'bg-white text-black' : 'text-white/70'
                          }`}
                        >
                          As {activePartyFriend.name.split(' ')[0]}
                        </button>
                      </div>
                    </div>

                    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                      {tracks.slice(0, 15).map((t) => {
                        const isCurrent = t.id === activePlayingTrack?.id;
                        const actor = partyControlAsFriend
                          ? activePartyFriend.name
                          : currentUser.name.split(' ')[0];
                        return (
                          <button
                            key={`party-pick-${t.id}`}
                            type="button"
                            onClick={() => onSwitchPartyTrack(t, actor)}
                            className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left transition-colors ${
                              isCurrent
                                ? 'bg-white text-black border-white'
                                : 'bg-white/[0.06] border-white/12 text-white hover:bg-white/14'
                            }`}
                          >
                            <CoverArt src={t.coverUrl} alt={t.title} className="h-6 w-6 rounded-full" />
                            <span className="text-xs font-semibold whitespace-nowrap">{t.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-40 overflow-y-auto glass-scroll">
                  {partyMessages.map((msg, idx) => (
                    <div
                      key={`${msg.id}-${idx}`}
                      className="flex items-baseline justify-between gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-2 text-xs"
                    >
                      <p className="text-white/90">
                        <span className="font-semibold text-white">{msg.sender}:</span> {msg.text}
                      </p>
                      <span className="shrink-0 text-[10px] text-white/45">{msg.timeLabel}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handlePartySend} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={partyInput}
                    onChange={(e) => setPartyInput(e.target.value)}
                    placeholder="Send a note or track reaction to the party..."
                    className="flex-1 rounded-full bg-white/[0.08] border border-white/15 px-4 py-2 text-xs sm:text-sm text-white placeholder:text-white/40 focus:border-white/35 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send party message"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* User Search & Firestore Public Directory */}
          <section aria-label="Search users and add friends" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Find Friends</h2>
              <span className="text-xs text-white/50 tabular-nums">{friends.length} friends</span>
            </div>

            <div className="liquid-glass-elevated flex items-center gap-3 rounded-full px-4 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-white/55" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search KLYN members by name or @handle..."
                aria-label="Search users"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              {isSearchingDirectory && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/60" />}
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch('')}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {searchedUsers.length > 0 ? (
              <div className="liquid-glass divide-y divide-white/[0.07] rounded-3xl px-3">
                {searchedUsers.map((user, idx) => {
                  const isKnownInState = socialUsers.some((s) => s.id === user.id);
                  return (
                    <div
                      key={`search-user-${user.id}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 px-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="h-11 w-11 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-white"
                            style={{ backgroundColor: user.accentColor || '#27272a' }}
                          >
                            <span>{user.initials}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                          <p className="truncate text-xs text-white/55">
                            {user.handle} · {user.tasteMatchPct}% match
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {user.isFriend && (
                          <button
                            type="button"
                            onClick={() => onRequestBlendPopup(user)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/12 border border-white/16 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white hover:text-black transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>Blend</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (isKnownInState) {
                              onToggleFriend(user.id);
                            } else {
                              onAddCustomFriend(user.handle, { ...user, isFriend: true });
                            }
                          }}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            user.isFriend
                              ? 'bg-white/14 border border-white/20 text-white hover:bg-white/20'
                              : 'bg-white text-black hover:scale-[1.02]'
                          }`}
                        >
                          {user.isFriend ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Friends</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Add Friend</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          {/* Friends' Live & Recent Listening Activity */}
          <section aria-label="Friends listening activity" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Friends&apos; Listening Activity
              </h2>
              <span className="text-xs text-white/50">Instant Blend &amp; Listen Party</span>
            </div>

            {friends.length === 0 ? (
              <div className="liquid-glass rounded-3xl p-6 text-center text-xs text-white/60">
                Add friends above to start Blend playlists and synced Listen Parties.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {friends.map((friend, idx) => {
                  const friendTrack =
                    trackById.get(friend.currentTrackId) ?? activeTrack ?? tracks[0] ?? null;
                  const isCurrent = Boolean(friendTrack && friendTrack.id === activeTrackId);
                  const friendSharedBlends = friend.sharedLibraryPlaylists ?? [];

                  return (
                    <div
                      key={`feed-${friend.id}-${idx}`}
                      className="liquid-glass rounded-3xl p-4 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {friend.avatarUrl ? (
                            <img
                              src={friend.avatarUrl}
                              alt={friend.name}
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ backgroundColor: friend.accentColor || '#27272a' }}
                            >
                              {friend.initials}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {friend.name}
                            </p>
                            <p className="text-[11px] text-white/55">{friend.lastActiveLabel}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onRequestBlendPopup(friend)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/14 border border-white/18 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white hover:text-black transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>Blend</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onRequestListenPartyPopup(friend)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/14 border border-white/18 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white hover:text-black transition-colors"
                          >
                            <Radio className="h-3 w-3" />
                            <span>Listen Party</span>
                          </button>
                        </div>
                      </div>

                      {friendTrack && (
                        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isCurrent) {
                                if (!isPlaying) onTogglePlay();
                                onOpenPlayer();
                              } else {
                                onPlayTrack(friendTrack, tracks);
                              }
                            }}
                            className="shrink-0 rounded-xl"
                          >
                            <CoverArt
                              src={friendTrack.coverUrl}
                              alt={friendTrack.title}
                              className="h-12 w-12 rounded-xl"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {friendTrack.title}
                            </p>
                            <button
                              type="button"
                              onClick={() => onOpenArtist(friendTrack.artist)}
                              className="truncate text-xs text-white/55 hover:text-white hover:underline"
                            >
                              {friendTrack.artist}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onReactToFriend(friend.id, 'Liked')}
                              aria-label={`Send reaction to ${friend.name}`}
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                friend.reaction
                                  ? 'bg-white text-black'
                                  : 'bg-white/10 text-white/75 hover:bg-white/20'
                              }`}
                            >
                              <Heart
                                className={`h-3.5 w-3.5 ${friend.reaction ? 'fill-current' : ''}`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isCurrent) onTogglePlay();
                                else onPlayTrack(friendTrack, tracks);
                              }}
                              aria-label={`Play ${friendTrack.title}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black"
                            >
                              {isCurrent && isPlaying ? (
                                <Pause className="h-3.5 w-3.5 fill-current" />
                              ) : (
                                <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {friendSharedBlends.length > 0 && (
                        <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
                            In {friend.name.split(' ')[0]}&apos;s Library
                          </p>
                          {friendSharedBlends.map((sb, sbIdx) => (
                            <div
                              key={`${sb.id}-${sbIdx}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate font-medium text-white/90">{sb.title}</span>
                              <span className="shrink-0 text-[11px] text-white/55 tabular-nums">
                                {sb.matchPct}% · {sb.trackIds.length} songs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Blend Playlist Preview & Instant Generator */}
          {blendFriend && (
            <section aria-label="Blend playlist with friends">
              <div
                className="liquid-glass-elevated relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5"
                style={{
                  background: `radial-gradient(circle at 88% 15%, ${blendFriend.accentColor}44 0%, rgba(24,24,27,0.75) 55%, rgba(12,12,15,0.95) 100%)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/14 border border-white/20">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/65">
                        Klyn AI Blend · {blendFriend.tasteMatchPct}% Taste Match
                      </p>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                        {currentUser.name.split(' ')[0]} + {blendFriend.name}
                      </h2>
                    </div>
                  </div>

                  <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                    {availableUsers.slice(0, 4).map((u, idx) => (
                      <button
                        key={`blend-pick-${u.id}-${idx}`}
                        type="button"
                        onClick={() => setSelectedBlendFriendId(u.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          blendFriend.id === u.id
                            ? 'bg-white text-black'
                            : 'bg-white/10 text-white/75 hover:bg-white/18'
                        }`}
                      >
                        {u.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {blendTracks.length > 0 && (
                  <div className="divide-y divide-white/[0.08] rounded-2xl bg-black/35 border border-white/10 px-3">
                    {blendTracks.map((t, idx) => (
                      <button
                        key={`blend-tr-${t.id}-${idx}`}
                        type="button"
                        onClick={() => onPlayTrack(t, blendTracks)}
                        className="flex w-full items-center gap-3 py-2.5 px-1 text-left hover:bg-white/[0.05] rounded-xl transition-colors"
                      >
                        <span className="w-4 text-xs font-semibold text-white/45 tabular-nums">
                          {idx + 1}
                        </span>
                        <CoverArt
                          src={t.coverUrl}
                          alt={t.title}
                          className="h-9 w-9 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs sm:text-sm font-semibold text-white">
                            {t.title}
                          </p>
                          <p className="truncate text-[11px] text-white/55">{t.artist}</p>
                        </div>
                        <span className="text-[11px] text-white/45 tabular-nums">
                          {formatTime(t.duration)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onRequestBlendPopup(blendFriend)}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Send Blend Pop-Up</span>
                  </button>

                  {blendTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onPlayTrack(blendTracks[0], blendTracks)}
                      className="liquid-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/14 transition-colors"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>Preview Mix</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onSaveBlendPlaylist(
                        blendFriend,
                        blendTracks.map((t) => t.id),
                        blendFriend.tasteMatchPct,
                      )
                    }
                    className="liquid-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/14 transition-colors"
                  >
                    <Disc3 className="h-4 w-4" />
                    <span>Save to Library</span>
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      <StoryShareModal
        isOpen={isStoryModalOpen}
        onClose={() => setIsStoryModalOpen(false)}
        period={period}
        totalTime={computedActivity.totalTime}
        tracksPlayed={computedActivity.tracksPlayed}
        vibeLabel={computedActivity.vibeLabel}
        topArtistName={computedActivity.topArtistName}
        topTrack={topTrack}
      />

      <MusicReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        period={period}
        totalTime={computedActivity.totalTime}
        tracksPlayed={computedActivity.tracksPlayed}
        artistStats={computedActivity.artistStats}
        tracks={tracks}
      />
    </div>
  );
};
