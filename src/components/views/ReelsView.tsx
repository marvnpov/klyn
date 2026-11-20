import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, WifiOff } from 'lucide-react';
import { fetchRealArtistPhoto, getCachedArtistPhoto } from '../../services/artistProfiles';
import { Track, UserAccount } from '../../types/music';
import { searchItunesCatalog, upgradeArtworkUrl } from '../../utils/itunesApi';

interface ReelsViewProps {
  tracks: Track[];
  currentUser: UserAccount;
  isActive: boolean;
  isOnline: boolean;
  offlineMode: boolean;
  onOpenArtist: (artistName: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

export const ReelsView: React.FC<ReelsViewProps> = ({
  tracks,
  currentUser,
  isActive,
  isOnline,
  offlineMode,
  onOpenArtist,
  onOpenAddToPlaylist,
  onRegisterTracks,
}) => {
  const [extraReels, setExtraReels] = useState<Track[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const genresKey = currentUser.favoriteGenres.join('|');

  // Fetch live iTunes catalog clips with 30s previewUrl matched to user genres (previews used strictly in Reels)
  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const controller = new AbortController();
    const queries = [
      ...(genresKey ? genresKey.split('|').slice(0, 2).map((g) => `${g} hits`) : []),
      'top music hits',
      'new drops music',
    ].slice(0, 3);

    Promise.allSettled(queries.map((q) => searchItunesCatalog(q, 12, controller.signal))).then(
      (results) => {
        if (controller.signal.aborted) return;
        const collected: Track[] = [];
        const seen = new Set<string>();
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          for (const t of r.value.tracks) {
            if (t.previewUrl && !seen.has(t.id)) {
              seen.add(t.id);
              collected.push(t);
            }
          }
        }
        if (collected.length > 0) {
          setExtraReels(collected);
          onRegisterTracks?.(collected);
        }
      },
    );

    return () => controller.abort();
  }, [genresKey, isOnline, offlineMode, onRegisterTracks]);

  const reelTracks = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of tracks) {
      if (t.previewUrl && !map.has(t.id)) map.set(t.id, t);
    }
    for (const t of extraReels) {
      if (t.previewUrl && !map.has(t.id)) map.set(t.id, t);
    }
    return Array.from(map.values()).slice(0, 30);
  }, [tracks, extraReels]);

  // Preload borderless circular artist portraits
  useEffect(() => {
    if (!isActive || reelTracks.length === 0) return;
    let cancelled = false;
    const targets = Array.from(new Set(reelTracks.slice(0, 12).map((t) => t.artist)));

    targets.forEach((artistName) => {
      const cached = getCachedArtistPhoto(artistName);
      if (cached) {
        setArtistPhotos((prev) => (prev[artistName] ? prev : { ...prev, [artistName]: cached }));
        return;
      }
      if (!isOnline || offlineMode) return;
      const fallback = reelTracks.find((t) => t.artist === artistName)?.coverUrl ?? '';
      fetchRealArtistPhoto(artistName, fallback).then((url) => {
        if (!cancelled && url) {
          setArtistPhotos((prev) => ({ ...prev, [artistName]: url }));
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isActive, reelTracks, isOnline, offlineMode]);

  // Track active snap slide in viewport
  useEffect(() => {
    const root = containerRef.current;
    if (!root || reelTracks.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const idxAttr = entry.target.getAttribute('data-reel-index');
            if (idxAttr !== null) {
              const parsed = Number(idxAttr);
              if (Number.isFinite(parsed)) {
                setActiveIndex(parsed);
              }
            }
          }
        }
      },
      { root, threshold: 0.65 },
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [reelTracks.length]);

  // Single reusable hidden <audio> element for automatic 30s preview playback (Reels only)
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.preload = 'auto';
    }
    const audio = audioRef.current;

    if (!isActive || !isOnline || offlineMode || reelTracks.length === 0) {
      audio.pause();
      return;
    }

    const activeTrack = reelTracks[activeIndex] ?? reelTracks[0];
    const url = activeTrack?.previewUrl;
    if (!url) {
      audio.pause();
      return;
    }

    if (audio.src !== url) {
      audio.src = url;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Browser autoplay gating until swipe/gesture
    });
  }, [isActive, isOnline, offlineMode, activeIndex, reelTracks]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
    };
  }, []);

  if (!isOnline || offlineMode) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-[#000000] px-6 pb-28 text-center">
        <div className="liquid-glass rounded-3xl p-8 max-w-sm space-y-3">
          <WifiOff className="mx-auto h-7 w-7 text-white/60" />
          <h2 className="font-display text-lg font-bold text-white">Reels Require Connection</h2>
          <p className="text-xs text-white/60 leading-relaxed">
            Disable Offline Mode or reconnect to stream Reels.
          </p>
        </div>
      </div>
    );
  }

  if (reelTracks.length === 0) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#000000] px-6 pb-28 text-center">
        <div className="h-44 w-44 animate-pulse rounded-3xl bg-white/10" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-label="KLYN Reels vertical music discovery"
      className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-[#000000]"
    >
      {reelTracks.map((track, idx) => {
        const hiResArt = upgradeArtworkUrl(track.coverUrl, '1000x1000bb') || track.coverUrl;
        const artistPhoto =
          artistPhotos[track.artist] || getCachedArtistPhoto(track.artist) || hiResArt;

        return (
          <div
            key={`reel-${track.id}-${idx}`}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            data-reel-index={idx}
            className="relative flex h-[100dvh] w-full snap-start snap-always flex-col justify-end overflow-hidden bg-[#000000]"
          >
            {/* Full-Bleed 100dvh Cover Artwork (No Playback Controls) */}
            <div aria-hidden="true" className="absolute inset-0">
              {hiResArt ? (
                <img
                  src={hiResArt}
                  alt={track.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ background: track.fallbackGradient }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/15" />
            </div>

            {/* Bottom-Left Artist Avatar + Track Name & Bottom-Right Full-Track Playlist '+' Button */}
            <div className="relative z-20 flex items-end justify-between gap-4 px-5 sm:px-8 pb-24 sm:pb-28">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenArtist(track.artist)}
                  aria-label={`Open ${track.artist} profile`}
                  className="shrink-0 rounded-full overflow-hidden focus:outline-none transition-transform hover:scale-105 active:scale-95"
                >
                  <img
                    src={artistPhoto}
                    alt={track.artist}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg sm:text-xl font-bold text-white drop-shadow">
                    {track.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenArtist(track.artist)}
                    className="block truncate text-sm font-medium text-white/80 hover:text-white hover:underline"
                  >
                    {track.artist}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenAddToPlaylist(track)}
                aria-label={`Add full track ${track.title} to playlist`}
                className="liquid-glass-elevated flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-90"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
