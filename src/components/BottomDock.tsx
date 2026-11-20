import React from 'react';
import { BarChart2, Home, Library, Pause, Play, Search, SkipForward } from 'lucide-react';
import { NavTab, Track } from '../types/music';
import { CoverArt } from './CoverArt';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';

interface BottomDockProps {
  activeTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  activeNav: NavTab;
  onNavChange: (nav: NavTab) => void;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onOpenPlayer: () => void;
}

const NAV_ITEMS: PillTabItem<NavTab>[] = [
  { id: 'Home', label: 'Home', icon: <Home className="h-[18px] w-[18px]" strokeWidth={2} /> },
  { id: 'Activity', label: 'Activity', icon: <BarChart2 className="h-[18px] w-[18px]" strokeWidth={2} /> },
  { id: 'Search', label: 'Search', icon: <Search className="h-[18px] w-[18px]" strokeWidth={2} /> },
  { id: 'Library', label: 'Library', icon: <Library className="h-[18px] w-[18px]" strokeWidth={2} /> },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeTrack,
  isPlaying,
  currentTime,
  activeNav,
  onNavChange,
  onTogglePlay,
  onNextTrack,
  onOpenPlayer,
}) => {
  const progressPct = activeTrack
    ? Math.min(100, Math.max(0, (currentTime / Math.max(activeTrack.duration, 1)) * 100))
    : 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2.5 px-4 pb-3 sm:pb-5">
      {/* Top Layer: Floating Mini-Player Pill */}
      {activeTrack && (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenPlayer}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenPlayer();
            }
          }}
          aria-label={`Open full player for ${activeTrack.title} by ${activeTrack.artist}`}
          className="pointer-events-auto liquid-glass-elevated relative w-full max-w-md cursor-pointer overflow-hidden rounded-full px-3 py-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="relative h-10 w-10 shrink-0 rounded-full transition-shadow duration-500"
                style={{
                  boxShadow: isPlaying
                    ? `0 0 18px ${activeTrack.primaryColor}88`
                    : '0 2px 8px rgba(0, 0, 0, 0.5)',
                }}
              >
                <CoverArt
                  src={activeTrack.coverUrl}
                  alt={activeTrack.album}
                  fallbackGradient={activeTrack.fallbackGradient}
                  className="h-10 w-10 rounded-full border border-white/15"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-white">
                  {activeTrack.title}
                </p>
                <p className="truncate text-xs text-white/55 leading-tight mt-0.5">
                  {activeTrack.artist}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay();
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-150 hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {isPlaying ? (
                  <Pause className="h-4.5 w-4.5 fill-white" />
                ) : (
                  <Play className="h-4.5 w-4.5 fill-white translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextTrack();
                }}
                aria-label="Next track"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-transform duration-150 hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <SkipForward className="h-4.5 w-4.5 fill-current" />
              </button>
            </div>
          </div>

          {/* 2px hairline progress bar hugging bottom curve */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full bg-white/90"
              style={{
                width: `${progressPct}%`,
                transition: 'width 0.25s linear',
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom Layer: Floating Navigation Pill Bar */}
      <nav className="pointer-events-auto w-full max-w-md" aria-label="Primary navigation">
        <SpringPillTabs
          items={NAV_ITEMS}
          activeId={activeNav}
          onChange={onNavChange}
          variant="equal"
          size="nav"
          ariaLabel="Main sections"
          className="liquid-glass-elevated p-1.5"
        />
      </nav>
    </div>
  );
};
