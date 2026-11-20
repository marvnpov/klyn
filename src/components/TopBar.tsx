import React from 'react';
import { AvatarStyle, TopFilterTab } from '../types/music';
import { BrandLogo } from './BrandLogo';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';
import { UserAvatar } from './UserAvatar';

interface TopBarProps {
  activeFilter: TopFilterTab;
  onFilterChange: (filter: TopFilterTab) => void;
  onOpenProfile: () => void;
  isProfileOpen: boolean;
  userName?: string;
  userInitials: string;
  userAvatarUrl?: string;
  userAvatarStyle?: AvatarStyle;
  userAccentColor?: string;
}

const FILTER_TABS: PillTabItem<TopFilterTab>[] = [
  { id: 'All', label: 'All' },
  { id: 'Music', label: 'Music' },
  { id: 'Spatial', label: 'Spatial' },
  { id: 'Mixes', label: 'Mixes' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeFilter,
  onFilterChange,
  onOpenProfile,
  isProfileOpen,
  userName,
  userInitials,
  userAvatarUrl,
  userAvatarStyle = 'monogram',
  userAccentColor = '#C27838',
}) => {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-center px-4 pt-3 sm:pt-4">
      <div className="relative flex w-full max-w-[1120px] items-center justify-center">
        {/* Desktop Brand Wordmark + Universal Logo */}
        <div className="pointer-events-auto hidden md:flex items-center gap-2.5 absolute left-0 select-none whitespace-nowrap">
          <BrandLogo className="h-7 w-7 rounded-lg border border-white/15 shadow-md" />
          <span className="font-display text-lg font-bold tracking-tight text-white/95">
            klyn
          </span>
        </div>

        {/* Unified Upper Floating Pill Bar */}
        <div className="pointer-events-auto liquid-glass-elevated flex items-center gap-1 rounded-full p-1.5">
          <SpringPillTabs
            items={FILTER_TABS}
            activeId={activeFilter}
            onChange={onFilterChange}
            variant="hug"
            size="sm"
            ariaLabel="Content filter"
            className="bg-transparent"
          />

          <span aria-hidden="true" className="mx-1 h-5 w-[1px] shrink-0 bg-white/15" />

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile and audio settings"
            aria-expanded={isProfileOpen}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
              isProfileOpen ? 'ring-2 ring-white' : 'ring-1 ring-white/20'
            }`}
          >
            <UserAvatar
              name={userName}
              initials={userInitials}
              avatarUrl={userAvatarUrl}
              avatarStyle={userAvatarStyle}
              accentColor={userAccentColor}
              sizeClass="h-8 w-8"
              textClass="text-[11px]"
              className="rounded-full"
            />
          </button>
        </div>
      </div>
    </header>
  );
};
