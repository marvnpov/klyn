import React, { useState } from 'react';
import { Check, ListPlus, Plus, X } from 'lucide-react';
import { PlaylistItem, Track } from '../types/music';
import { CoverArt } from './CoverArt';

interface AddToPlaylistModalProps {
  track: Track | null;
  playlists: PlaylistItem[];
  onClose: () => void;
  onToggleTrackInPlaylist: (playlistId: string, track: Track) => void;
  onCreatePlaylistWithTrack: (title: string, track: Track) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  track,
  playlists,
  onClose,
  onToggleTrackInPlaylist,
  onCreatePlaylistWithTrack,
}) => {
  const [newTitle, setNewTitle] = useState('');

  if (!track) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onCreatePlaylistWithTrack(trimmed, track);
    setNewTitle('');
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${track.title} to playlist`}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <CoverArt
              src={track.coverUrl}
              alt={track.title}
              fallbackGradient={track.fallbackGradient}
              className="h-11 w-11 shrink-0 rounded-xl border border-white/15"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/55">Add to Playlist</p>
              <h2 className="font-display truncate text-base font-bold text-white">
                {track.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add to playlist modal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Create New Playlist Inline Form */}
        <form onSubmit={handleCreate} className="mt-4 flex items-center gap-2">
          <div className="liquid-glass flex flex-1 items-center gap-2 rounded-full px-3.5 py-2">
            <ListPlus className="h-4 w-4 shrink-0 text-white/55" />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New playlist name..."
              aria-label="New playlist name"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-black transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create</span>
          </button>
        </form>

        {/* Existing Playlists List */}
        <div className="glass-scroll mt-4 space-y-2 overflow-y-auto pr-1">
          {playlists.map((pl) => {
            const isInPlaylist = pl.trackIds.includes(track.id);
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => onToggleTrackInPlaylist(pl.id, track)}
                className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${
                  isInPlaylist
                    ? 'bg-white/14 border border-white/20'
                    : 'bg-white/[0.04] border border-transparent hover:bg-white/10'
                }`}
              >
                <CoverArt
                  src={pl.coverUrl}
                  alt={pl.title}
                  className="h-12 w-12 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{pl.title}</p>
                  <p className="truncate text-xs text-white/55 tabular-nums">
                    {pl.trackIds.length} {pl.trackIds.length === 1 ? 'song' : 'songs'} · {pl.curator}
                  </p>
                </div>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isInPlaylist
                      ? 'bg-white text-black border-white'
                      : 'bg-white/8 text-white/75 border-white/15'
                  }`}
                >
                  {isInPlaylist ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
