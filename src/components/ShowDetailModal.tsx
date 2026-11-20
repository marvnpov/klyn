import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import { formatTime } from '../data/catalog';
import { episodeToTrack, fetchShowEpisodes } from '../services/podcastsApi';
import { PodcastShow, ShowEpisode, ShowProgressEntry, Track } from '../types/music';
import { CoverArt } from './CoverArt';

interface ShowDetailModalProps {
  show: PodcastShow | null;
  activeTrackId: string | null;
  isPlaying: boolean;
  showProgress: Record<string, ShowProgressEntry>;
  downloadedTrackIds: Set<string>;
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  onSkipBy: (seconds: number) => void;
  onClose: () => void;
  onPlayEpisode: (
    show: PodcastShow,
    episode: ShowEpisode,
    resumeAt: number,
    speed: number,
  ) => void;
  onTogglePlay: () => void;
  onToggleDownload: (track: Track) => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2];

export const ShowDetailModal: React.FC<ShowDetailModalProps> = ({
  show,
  activeTrackId,
  isPlaying,
  showProgress,
  downloadedTrackIds,
  playbackSpeed,
  onChangePlaybackSpeed,
  onSkipBy,
  onClose,
  onPlayEpisode,
  onTogglePlay,
  onToggleDownload,
}) => {
  const [episodes, setEpisodes] = useState<ShowEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!show) {
      setEpisodes([]);
      return;
    }
    setEpisodes(show.episodes);
    const controller = new AbortController();
    setIsLoading(true);
    fetchShowEpisodes(show, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted && rows.length > 0) {
          setEpisodes(rows);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [show]);

  if (!show) return null;

  const savedProgress = showProgress[show.id];
  const isCurrentShowActive = episodes.some((ep) => ep.id === activeTrackId);

  const resumeEpisode =
    (savedProgress
      ? episodes.find((ep) => ep.id === savedProgress.episodeId)
      : undefined) ?? episodes[0];

  return (
    <div
      className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={show.title}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl text-white shadow-2xl"
      >
        {/* Header Hero */}
        <div className="relative flex items-start gap-4 border-b border-white/10 p-5 sm:p-6">
          <CoverArt
            src={show.coverUrl}
            alt={show.title}
            className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl shadow-xl"
          />
          <div className="min-w-0 flex-1 pr-8">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
              {show.kind === 'audiobook' ? (
                <BookOpen className="h-3.5 w-3.5" />
              ) : (
                <Headphones className="h-3.5 w-3.5" />
              )}
              <span>{show.kind === 'audiobook' ? 'Audiobook' : 'Podcast'}</span>
            </div>
            <h2 className="font-display mt-1.5 text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2">
              {show.title}
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm font-medium text-white/65 truncate">
              {show.author} · {show.genre}
            </p>
            <p className="mt-2 text-xs text-white/55 line-clamp-2">{show.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close show details"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Playback Controls Strip (Resume, Speed & ±15s Skip) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-5 py-3">
          <div className="flex items-center gap-2">
            {resumeEpisode && (
              <button
                type="button"
                onClick={() => {
                  if (activeTrackId === resumeEpisode.id) {
                    onTogglePlay();
                  } else {
                    const resumePos =
                      savedProgress && savedProgress.episodeId === resumeEpisode.id
                        ? savedProgress.position
                        : 0;
                    onPlayEpisode(show, resumeEpisode, resumePos, playbackSpeed);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform"
              >
                {activeTrackId === resumeEpisode.id && isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-black" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-black" />
                )}
                <span>
                  {savedProgress && savedProgress.position > 5
                    ? `Resume ${formatTime(savedProgress.position)}`
                    : show.kind === 'audiobook'
                      ? 'Listen Chapter 1'
                      : 'Play Latest'}
                </span>
              </button>
            )}

            {isCurrentShowActive && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSkipBy(-15)}
                  aria-label="Rewind 15 seconds"
                  className="liquid-glass inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/15"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>15s</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSkipBy(15)}
                  aria-label="Forward 15 seconds"
                  className="liquid-glass inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/15"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>15s</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((spd) => {
              const selected = Math.abs(playbackSpeed - spd) < 0.05;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onChangePlaybackSpeed(spd)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                    selected
                      ? 'bg-white text-black'
                      : 'bg-white/8 text-white/70 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>
        </div>

        {/* Episodes / Chapters List */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-5 space-y-2">
          {isLoading && episodes.length === 0 ? (
            <div className="space-y-2.5 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl bg-white/8"
                />
              ))}
            </div>
          ) : episodes.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/55">
              No streamable episodes found for this release.
            </div>
          ) : (
            episodes.map((ep, idx) => {
              const epTrack = episodeToTrack(show, ep);
              const isEpActive = activeTrackId === ep.id;
              const isDownloaded = downloadedTrackIds.has(ep.id);
              const epResumeAt =
                savedProgress && savedProgress.episodeId === ep.id
                  ? savedProgress.position
                  : 0;

              return (
                <div
                  key={ep.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl p-3 transition-colors ${
                    isEpActive
                      ? 'bg-white/14 border border-white/20'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isEpActive) {
                        onTogglePlay();
                      } else {
                        onPlayEpisode(show, ep, epResumeAt, playbackSpeed);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                      {isEpActive && isPlaying ? (
                        <Pause className="h-4 w-4 fill-white" />
                      ) : (
                        <Play className="h-4 w-4 fill-white ml-0.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {ep.episodeNumber ?? idx + 1}. {ep.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-[11px] text-white/55 tabular-nums">
                        <span>{formatTime(ep.duration)}</span>
                        {epResumeAt > 5 && (
                          <span className="text-emerald-300">
                            · {formatTime(epResumeAt)} played
                          </span>
                        )}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleDownload(epTrack)}
                    aria-label={isDownloaded ? 'Remove offline download' : 'Download episode'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isDownloaded
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-white/8 text-white/70 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {isDownloaded ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
