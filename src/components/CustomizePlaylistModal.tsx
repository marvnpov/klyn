import React, { useState } from 'react';
import { Check, Palette, Pin, SlidersHorizontal, X } from 'lucide-react';
import { PlaylistDisplayMode, Track } from '../types/music';
import { CoverArt } from './CoverArt';

export const ACCENT_GRADIENT_PRESETS = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    gradient: 'linear-gradient(135deg, rgba(63,63,70,0.65) 0%, rgba(24,24,27,0.85) 55%, rgba(9,9,11,0.98) 100%)',
  },
  {
    id: 'amber',
    label: 'Amber',
    gradient: 'linear-gradient(135deg, rgba(194,120,56,0.72) 0%, rgba(46,30,18,0.88) 65%, rgba(12,12,15,0.96) 100%)',
  },
  {
    id: 'crimson',
    label: 'Crimson',
    gradient: 'linear-gradient(135deg, rgba(185,56,72,0.74) 0%, rgba(37,23,58,0.88) 65%, rgba(12,12,15,0.96) 100%)',
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    gradient: 'linear-gradient(135deg, rgba(43,120,184,0.74) 0%, rgba(22,37,51,0.88) 65%, rgba(12,12,15,0.96) 100%)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    gradient: 'linear-gradient(135deg, rgba(77,148,115,0.72) 0%, rgba(27,67,50,0.88) 65%, rgba(12,12,15,0.96) 100%)',
  },
  {
    id: 'rose-violet',
    label: 'Rose Violet',
    gradient: 'linear-gradient(135deg, rgba(244,63,94,0.75) 0%, rgba(168,85,247,0.65) 52%, rgba(67,56,202,0.8) 100%)',
  },
];

export interface CustomizePlaylistTarget {
  isLikedSongs: boolean;
  id: string;
  title: string;
  description: string;
  coverUrl?: string;
  pinned: boolean;
  accentGradient: string;
  displayMode: PlaylistDisplayMode;
  showQualityBadges: boolean;
}

interface CustomizePlaylistModalProps {
  target: CustomizePlaylistTarget | null;
  tracks: Track[];
  onClose: () => void;
  onSave: (updated: CustomizePlaylistTarget) => void;
}

export const CustomizePlaylistModal: React.FC<CustomizePlaylistModalProps> = ({
  target,
  tracks,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(target?.title ?? '');
  const [description, setDescription] = useState(target?.description ?? '');
  const [coverUrl, setCoverUrl] = useState(target?.coverUrl ?? tracks[0]?.coverUrl ?? '');
  const [pinned, setPinned] = useState(target?.pinned ?? false);
  const [accentGradient, setAccentGradient] = useState(
    target?.accentGradient ?? ACCENT_GRADIENT_PRESETS[0].gradient,
  );
  const [displayMode, setDisplayMode] = useState<PlaylistDisplayMode>(
    target?.displayMode ?? 'comfortable',
  );
  const [showQualityBadges, setShowQualityBadges] = useState(
    target?.showQualityBadges ?? true,
  );

  const fallbackCoverUrl = tracks[0]?.coverUrl ?? '';

  // Sync local form state when target changes
  React.useEffect(() => {
    if (!target) return;
    setTitle(target.title);
    setDescription(target.description);
    setCoverUrl(target.coverUrl ?? fallbackCoverUrl);
    setPinned(target.pinned);
    setAccentGradient(target.accentGradient);
    setDisplayMode(target.displayMode);
    setShowQualityBadges(target.showQualityBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  const coverChoices = Array.from(new Set(tracks.map((t) => t.coverUrl)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim() || target.title;
    onSave({
      ...target,
      title: cleanTitle,
      description: description.trim() || target.description,
      coverUrl: target.isLikedSongs ? undefined : coverUrl,
      pinned,
      accentGradient,
      displayMode,
      showQualityBadges,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Customize ${target.title}`}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-5 w-5 text-white/85" />
            <h2 className="font-display text-lg font-bold text-white">
              Customize {target.isLikedSongs ? 'Liked Songs' : 'Playlist'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customize modal"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="glass-scroll mt-4 space-y-4 overflow-y-auto pr-1">
          {/* Title & Description */}
          <div>
            <label htmlFor="cust-title" className="block text-xs font-semibold text-white/60 mb-1.5">
              Title
            </label>
            <input
              id="cust-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[44px] rounded-2xl bg-white/[0.06] border border-white/15 px-4 text-sm text-white focus:border-white/35 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="cust-desc" className="block text-xs font-semibold text-white/60 mb-1.5">
              Description
            </label>
            <input
              id="cust-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[44px] rounded-2xl bg-white/[0.06] border border-white/15 px-4 text-sm text-white focus:border-white/35 focus:outline-none"
            />
          </div>

          {/* Accent Style Picker */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/60">
              <Palette className="h-3.5 w-3.5" />
              <span>Accent Glass Style</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ACCENT_GRADIENT_PRESETS.map((preset) => {
                const selected = accentGradient === preset.gradient;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setAccentGradient(preset.gradient)}
                    className={`flex items-center gap-2 rounded-2xl p-2 text-left text-xs font-medium border transition-all ${
                      selected
                        ? 'border-white bg-white/14 text-white'
                        : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-white/25"
                      style={{ background: preset.gradient }}
                    />
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cover Artwork Picker for regular playlists */}
          {!target.isLikedSongs && (
            <div>
              <p className="mb-2 text-xs font-semibold text-white/60">Cover Artwork</p>
              <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
                {coverChoices.map((url) => {
                  const selected = coverUrl === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setCoverUrl(url)}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-transform ${
                        selected ? 'border-white scale-105' : 'border-transparent opacity-65 hover:opacity-100'
                      }`}
                    >
                      <CoverArt src={url} alt="Cover choice" className="h-full w-full" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Display Preferences & Pinning */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3.5">
            <p className="text-xs font-semibold text-white/65">Display &amp; Pin Preferences</p>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pin className="h-4 w-4 text-white/75" />
                <span className="text-sm text-white">Pin to top of Library</span>
              </div>
              <button
                type="button"
                onClick={() => setPinned((p) => !p)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  pinned ? 'bg-white text-black' : 'bg-white/10 text-white/75'
                }`}
              >
                {pinned && <Check className="h-3 w-3" />}
                <span>{pinned ? 'Pinned' : 'Unpinned'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-sm text-white">Track Row Density</span>
              <div className="flex items-center gap-1 rounded-full bg-white/[0.08] p-1">
                {(['comfortable', 'compact'] as PlaylistDisplayMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDisplayMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      displayMode === mode ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-sm text-white">Show Quality Badges</span>
              <button
                type="button"
                onClick={() => setShowQualityBadges((b) => !b)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  showQualityBadges ? 'bg-white text-black' : 'bg-white/10 text-white/75'
                }`}
              >
                {showQualityBadges && <Check className="h-3 w-3" />}
                <span>{showQualityBadges ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="liquid-glass flex-1 rounded-full py-2.5 px-4 text-xs sm:text-sm font-semibold text-white/85 hover:bg-white/12"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-full bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-black transition-transform hover:scale-[1.01] active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
