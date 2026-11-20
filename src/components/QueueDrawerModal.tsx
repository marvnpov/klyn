import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ListMusic, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { formatTime } from '../data/catalog';
import { Track } from '../types/music';
import { searchItunesCatalog } from '../utils/itunesApi';
import { CoverArt } from './CoverArt';

interface QueueDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrack: Track | null;
  queue: Track[];
  allTracks: Track[];
  onSelectTrack: (track: Track) => void;
  onMoveTrack: (fromIndex: number, toIndex: number) => void;
  onRemoveTrack: (index: number) => void;
  onClearUpcoming: () => void;
  onAddTrack: (track: Track) => void;
}

export const QueueDrawerModal: React.FC<QueueDrawerModalProps> = ({
  isOpen,
  onClose,
  activeTrack,
  queue,
  allTracks,
  onSelectTrack,
  onMoveTrack,
  onRemoveTrack,
  onClearUpcoming,
  onAddTrack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [apiTracks, setApiTracks] = useState<Track[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  useEffect(() => {
    const clean = searchQuery.trim();
    if (!isOpen || clean.length < 2) {
      setApiTracks([]);
      setIsSearchingApi(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingApi(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await searchItunesCatalog(clean, 10, controller.signal);
        if (!controller.signal.aborted) {
          setApiTracks(res.tracks);
          setIsSearchingApi(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsSearchingApi(false);
        }
      }
    }, 340);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, searchQuery]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return showAllTracks ? allTracks : [];

    const localMatches = allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q),
    );

    const seen = new Set(localMatches.map((t) => t.id));
    const merged = [...localMatches];
    for (const ext of apiTracks) {
      if (!seen.has(ext.id)) {
        seen.add(ext.id);
        merged.push(ext);
      }
    }
    return merged;
  }, [allTracks, apiTracks, searchQuery, showAllTracks]);

  if (!isOpen) return null;

  const activeIndex = activeTrack ? queue.findIndex((t) => t.id === activeTrack.id) : -1;
  const upcomingEntries = queue
    .map((track, idx) => ({ track, idx }))
    .filter(({ idx }) => idx > activeIndex);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Queue Management"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[86dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <ListMusic className="h-5 w-5 text-white/85" />
            <h2 className="font-display text-lg font-bold text-white">Queue Management</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close queue"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Always-Accessible Search-to-Add Bar */}
        <div className="mt-4">
          <div className="liquid-glass flex items-center gap-2.5 rounded-full px-3.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-white/55" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local or global tracks to add to queue..."
              aria-label="Search tracks to add to queue"
              className="w-full bg-transparent text-xs sm:text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            {isSearchingApi && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/70" />}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear queue search"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/80 hover:bg-white/25"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="glass-scroll mt-4 space-y-5 overflow-y-auto pr-1">
          {/* Search Results / Quick Add Catalog */}
          {(searchQuery.trim().length > 0 || showAllTracks) && (
            <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
                  {searchQuery.trim()
                    ? `Matching Tracks (${searchResults.length})`
                    : 'Tap a track to add to queue'}
                </p>
                {showAllTracks && !searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setShowAllTracks(false)}
                    className="text-[11px] font-medium text-white/60 hover:text-white"
                  >
                    Hide
                  </button>
                )}
              </div>

              {isSearchingApi && searchResults.length === 0 ? (
                <p className="px-1 py-2 text-xs text-white/55">Searching music catalog…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-1 py-2 text-xs text-white/50">
                  No tracks matched &ldquo;{searchQuery}&rdquo;.
                </p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto glass-scroll">
                  {searchResults.map((t) => {
                    const isAlreadyUpcoming = upcomingEntries.some((e) => e.track.id === t.id);
                    return (
                      <button
                        key={`searchq-${t.id}`}
                        type="button"
                        onClick={() => onAddTrack(t)}
                        className="flex w-full items-center justify-between gap-2.5 rounded-xl p-1.5 text-left hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CoverArt
                            src={t.coverUrl}
                            alt={t.title}
                            fallbackGradient={t.fallbackGradient}
                            className="h-9 w-9 shrink-0 rounded-lg"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">{t.title}</p>
                            <p className="truncate text-[11px] text-white/55">
                              {t.artist} · {formatTime(t.duration)}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/14 px-2.5 py-1 text-[11px] font-semibold text-white">
                          <Plus className="h-3 w-3" />
                          <span>{isAlreadyUpcoming ? 'Queue Next' : 'Add'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Now Playing */}
          {activeTrack && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Now Playing
              </p>
              <div className="flex items-center gap-3 rounded-2xl bg-white/12 border border-white/20 p-2.5">
                <CoverArt
                  src={activeTrack.coverUrl}
                  alt={activeTrack.title}
                  fallbackGradient={activeTrack.fallbackGradient}
                  className="h-12 w-12 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{activeTrack.title}</p>
                  <p className="truncate text-xs text-white/60">
                    {activeTrack.artist} · {formatTime(activeTrack.duration)}
                  </p>
                </div>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Playing
                </span>
              </div>
            </div>
          )}

          {/* Upcoming Queue */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Up Next ({upcomingEntries.length})
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAllTracks((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>{showAllTracks ? 'Hide Catalog' : 'Browse All'}</span>
                </button>
                {upcomingEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearUpcoming}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {upcomingEntries.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 text-center">
                <p className="text-xs font-semibold text-white/80">No upcoming tracks in queue</p>
                <p className="mt-1 text-[11px] text-white/50">
                  Use the search bar above to find and add songs straight into Up Next.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingEntries.map(({ track, idx }, pos) => (
                  <div
                    key={`upcoming-${track.id}-${idx}`}
                    className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] border border-white/10 p-2 hover:bg-white/[0.08] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTrack(track)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <CoverArt
                        src={track.coverUrl}
                        alt={track.title}
                        fallbackGradient={track.fallbackGradient}
                        className="h-10 w-10 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs sm:text-sm font-semibold text-white">
                          {track.title}
                        </p>
                        <p className="truncate text-[11px] text-white/55">
                          {track.artist} · {formatTime(track.duration)}
                        </p>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={pos === 0}
                        onClick={() => onMoveTrack(idx, idx - 1)}
                        aria-label={`Move ${track.title} up`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/12 hover:text-white disabled:opacity-25 disabled:pointer-events-none"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pos === upcomingEntries.length - 1}
                        onClick={() => onMoveTrack(idx, idx + 1)}
                        aria-label={`Move ${track.title} down`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/12 hover:text-white disabled:opacity-25 disabled:pointer-events-none"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTrack(idx)}
                        aria-label={`Remove ${track.title} from queue`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/12 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
