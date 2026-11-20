import React from 'react';
import { AvatarStyle } from '../types/music';
import { KlynLogo } from './KlynLogo';
import { UserAvatar } from './UserAvatar';

interface TopBarProps {
  onOpenProfile: () => void;
  isProfileOpen: boolean;
  hidden?: boolean;
  userName?: string;
  userInitials: string;
  userAvatarUrl?: string;
  userAvatarStyle?: AvatarStyle;
  userAccentColor?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenProfile,
  isProfileOpen,
  hidden = false,
  userName,
  userInitials,
  userAvatarUrl,
  userAvatarStyle = 'monogram',
  userAccentColor = '#C27838',
}) => {
  if (hidden) return null;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-center px-4 sm:px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-4">
      <div className="pointer-events-auto liquid-glass-elevated flex w-full max-w-[1120px] items-center justify-between rounded-full px-4 sm:px-5 py-2.5 sm:py-3">
        {/* Left: Enlarged KLYN Brand Mark + Bold Wordmark */}
        <div className="flex items-center gap-3 select-none">
          <KlynLogo size={36} className="shadow-lg" />
          <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
            klyn
          </span>
        </div>

        {/* Right: Pure Borderless Circular User Avatar */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open profile and settings"
          aria-expanded={isProfileOpen}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none"
        >
          <UserAvatar
            name={userName}
            initials={userInitials}
            avatarUrl={userAvatarUrl}
            avatarStyle={userAvatarStyle}
            accentColor={userAccentColor}
            sizeClass="h-10 w-10"
            textClass="text-xs"
          />
        </button>
      </div>
    </header>
  );
};
