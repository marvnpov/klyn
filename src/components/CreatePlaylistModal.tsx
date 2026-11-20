import React, { useState } from 'react';
import { Check, ListPlus, Plus, X } from 'lucide-react';
import { Track } from '../types/music';
import { CoverArt } from './CoverArt';

interface CreatePlaylistModalProps {
  isOpen: boolean;
  tracks: Track[];
  onClose: () => void;
  onCreatePlaylist: (payload: {
    title: string;
    description: string;
    coverUrl: string;
    trackIds: string[];
  }) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  tracks,
  onClose,
  onCreatePlaylist,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCoverUrl, setSelectedCoverUrl] = useState(tracks[0]?.coverUrl ?? '');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>(() =>
    tracks.slice(0, 2).map((t) => t.id),
  );

  if (!isOpen) return null;

  const coverChoices = Array.from(new Set(tracks.map((t) => t.coverUrl)));

  const toggleTrack = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onCreatePlaylist({
      title: cleanTitle,
      description: description.trim() || 'Curated Liquid Glass collection',
      coverUrl: selectedCoverUrl || tracks[0]?.coverUrl || '',
      trackIds: selectedTrackIds,
    });
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Create Playlist"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <ListPlus className="h-5 w-5 text-white/85" />
            <h2 className="font-display text-lg font-bold text-white">Create Playlist</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create playlist modal"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="glass-scroll mt-4 space-y-4 overflow-y-auto pr-1">
          {/* Name & Description */}
          <div className="space-y-3">
            <div>
              <label htmlFor="pl-title" className="block text-xs font-semibold text-white/60 mb-1.5">
                Playlist Name
              </label>
              <input
                id="pl-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Afterhours Obsidian"
                className="w-full rounded-2xl bg-white/[0.06] border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/35 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="pl-desc" className="block text-xs font-semibold text-white/60 mb-1.5">
                Description (Optional)
              </label>
              <input
                id="pl-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Late-night spatial & lossless favorites"
                className="w-full rounded-2xl bg-white/[0.06] border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/35 focus:outline-none"
              />
            </div>
          </div>

          {/* Cover Artwork Picker */}
          <div>
            <p className="text-xs font-semibold text-white/60 mb-2">Cover Style</p>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
              {coverChoices.map((url) => {
                const selected = selectedCoverUrl === url;
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSelectedCoverUrl(url)}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-transform ${
                      selected ? 'border-white scale-105' : 'border-transparent opacity-65 hover:opacity-100'
                    }`}
                  >
                    <CoverArt src={url} alt="Playlist cover option" className="h-full w-full" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Track Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/60">Select Tracks</p>
              <span className="text-xs text-white/50 tabular-nums">
                {selectedTrackIds.length} selected
              </span>
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto glass-scroll pr-1">
              {tracks.map((track) => {
                const selected = selectedTrackIds.includes(track.id);
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => toggleTrack(track.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${
                      selected
                        ? 'bg-white/14 border border-white/20'
                        : 'bg-white/[0.04] border border-transparent hover:bg-white/10'
                    }`}
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
                      <p className="truncate text-[11px] text-white/55">{track.artist}</p>
                    </div>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? 'bg-white text-black border-white'
                          : 'bg-white/10 text-white/70 border-white/15'
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
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
            disabled={!title.trim()}
            className="flex-1 rounded-full bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-black transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-40"
          >
            Save Playlist
          </button>
        </div>
      </form>
    </div>
  );
};
