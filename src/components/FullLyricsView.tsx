import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ExternalLink, Pause, Play, Quote, SkipBack, SkipForward } from 'lucide-react';
import { Track } from '../types/music';
import { CoverArt } from './CoverArt';
import { ExpandingScrubber } from './ExpandingScrubber';

interface FullLyricsViewProps {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  autoScrollLyrics: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onExitLyrics: () => void;
  onCollapsePlayer: () => void;
}

const SKELETON_LINE_WIDTHS = ['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3', 'w-5/6', 'w-3/5', 'w-2/5'];

export const FullLyricsView: React.FC<FullLyricsViewProps> = ({
  track,
  isPlaying,
  currentTime,
  autoScrollLyrics,
  onSeek,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onExitLyrics,
  onCollapsePlayer,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastScrolledIdx = useRef<number>(-1);

  const hasSyncedTimestamps = useMemo(
    () => track.lyrics.some((line) => line.time >= 0),
    [track.lyrics],
  );

  const activeLineIdx = useMemo(() => {
    if (!hasSyncedTimestamps || track.lyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < track.lyrics.length; i++) {
      if (track.lyrics[i].time <= currentTime + 0.15) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [hasSyncedTimestamps, track.lyrics, currentTime]);

  useEffect(() => {
    lastScrolledIdx.current = -1;
    lineRefs.current = [];
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [track.id]);

  useEffect(() => {
    if (!autoScrollLyrics || !hasSyncedTimestamps || activeLineIdx < 0) return;
    if (activeLineIdx === lastScrolledIdx.current) return;
    lastScrolledIdx.current = activeLineIdx;

    const container = scrollContainerRef.current;
    const el = lineRefs.current[activeLineIdx];
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
  }, [activeLineIdx, autoScrollLyrics, hasSyncedTimestamps]);

  const googleSearchHref = useMemo(
    () =>
      `https://www.google.com/search?q=${encodeURIComponent(
        `${track.title} ${track.artist} lyrics`,
      )}`,
    [track.title, track.artist],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Top Docked Pill Header */}
      <div className="relative z-20 flex items-center justify-center px-4 pt-4 sm:pt-6">
        <div className="liquid-glass-elevated flex w-full max-w-xl items-center justify-between gap-3 rounded-full px-3 py-2">
          <button
            type="button"
            onClick={onExitLyrics}
            className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-full pr-2 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <CoverArt
              src={track.coverUrl}
              alt={track.title}
              fallbackGradient={track.fallbackGradient}
              className="h-10 w-10 shrink-0 rounded-full border border-white/15"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{track.title}</p>
              <p className="truncate text-xs text-white/55">{track.artist}</p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onCollapsePlayer}
              aria-label="Collapse player"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/85 hover:bg-white/20 hover:text-white transition-colors"
            >
              <ChevronDown className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Time-Synced Lyrics Canvas */}
      <div
        ref={scrollContainerRef}
        className="glass-scroll relative z-10 flex-1 overflow-y-auto px-5 sm:px-10 py-28 sm:py-36"
      >
        {track.lyricsLoading && track.lyrics.length === 0 ? (
          <div
            aria-label="Loading synced lyrics"
            className="mx-auto flex max-w-2xl flex-col gap-5 sm:gap-7 py-6"
          >
            {SKELETON_LINE_WIDTHS.map((widthClass, idx) => (
              <div
                key={`lyric-skel-${idx}`}
                className={`h-7 sm:h-9 rounded-2xl bg-white/[0.09] animate-pulse ${widthClass}`}
                style={{ opacity: Math.max(0.28, 0.9 - idx * 0.08) }}
              />
            ))}
          </div>
        ) : track.lyrics.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
            <Quote className="h-8 w-8 text-white/35" />
            <p className="font-display text-xl sm:text-2xl font-bold text-white/85">
              Synced lyrics unavailable for this track
            </p>
            <p className="text-xs sm:text-sm text-white/50">
              No timestamped or plain lyrics were returned for this release.
            </p>
            <a
              href={googleSearchHref}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-glass mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-white/14 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span>Search on Google for full lyrics</span>
              <ExternalLink className="h-3.5 w-3.5 text-white/75" />
            </a>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5 sm:gap-7">
            {!hasSyncedTimestamps && (
              <p className="text-xs font-medium text-white/45">
                Plain lyrics from LRCLIB · Time-sync timestamps unavailable for this release
              </p>
            )}
            {track.lyrics.map((line, idx) => {
              const isActive = hasSyncedTimestamps && idx === activeLineIdx;
              const distance =
                hasSyncedTimestamps && activeLineIdx >= 0 ? Math.abs(idx - activeLineIdx) : 0;
              const isFar = hasSyncedTimestamps && activeLineIdx >= 0 && distance >= 3;

              return (
                <button
                  key={`${track.id}-line-${line.time}-${idx}`}
                  ref={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                  type="button"
                  disabled={line.time < 0}
                  onClick={() => {
                    if (line.time >= 0) onSeek(line.time);
                  }}
                  className={`font-display origin-left text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-xl px-2 py-1 ${
                    !hasSyncedTimestamps
                      ? 'text-xl md:text-3xl font-bold text-white/80 cursor-default'
                      : isActive
                        ? 'scale-[1.02] text-2xl md:text-4xl font-bold text-white opacity-100'
                        : `text-xl md:text-3xl font-bold text-white/25 hover:text-white/60 ${
                            isFar ? 'blur-[1px]' : ''
                          }`
                  }`}
                  style={
                    isActive
                      ? { textShadow: '0 0 28px rgba(255, 255, 255, 0.35)' }
                      : undefined
                  }
                >
                  {line.text}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Top & Bottom Edge Fade Masks */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-16 h-20 bg-gradient-to-b from-black/70 to-transparent z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-28 h-24 bg-gradient-to-t from-black/80 to-transparent z-10"
      />

      {/* Bottom Floating Controls Pill */}
      <div className="relative z-20 flex items-center justify-center px-4 pb-5 sm:pb-7">
        <div className="liquid-glass-elevated w-full max-w-xl rounded-3xl px-4 py-3 sm:px-5 sm:py-3.5">
          <ExpandingScrubber
            currentTime={currentTime}
            duration={track.duration}
            onSeek={onSeek}
            compact
            showTimestamps
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="w-20" />

            <div className="flex items-center gap-3 sm:gap-5">
              <button
                type="button"
                onClick={onPrevTrack}
                aria-label="Previous track"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white active:scale-90 transition-all"
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg active:scale-90 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onNextTrack}
                aria-label="Next track"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white active:scale-90 transition-all"
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </button>
            </div>

            <button
              type="button"
              onClick={onExitLyrics}
              aria-label="Lyrics active — click to exit lyrics"
              className="flex h-9 w-20 items-center justify-center gap-1.5 rounded-full bg-white text-black text-xs font-semibold shadow-sm active:scale-95 transition-transform"
            >
              <Quote className="h-3.5 w-3.5 fill-current" />
              <span>Lyrics</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
