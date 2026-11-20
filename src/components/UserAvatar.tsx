import React, { useEffect, useState } from 'react';
import { AvatarStyle } from '../types/music';

interface UserAvatarProps {
  name?: string;
  initials: string;
  avatarUrl?: string;
  avatarStyle?: AvatarStyle;
  accentColor?: string;
  sizeClass?: string;
  textClass?: string;
  className?: string;
  glow?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = 'klyn user',
  initials,
  avatarUrl,
  avatarStyle = 'monogram',
  accentColor = '#C27838',
  sizeClass = 'h-10 w-10',
  textClass = 'text-xs',
  className = '',
  glow = false,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const cleanAvatar = typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 && !imgError;
  const radiusClass = avatarStyle === 'glass-emblem' ? 'rounded-2xl' : 'rounded-full';

  if (cleanAvatar) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden bg-zinc-900 ${radiusClass} ${sizeClass} ${className}`}
        style={{
          border: `1.5px solid ${accentColor}`,
          boxShadow: glow ? `0 0 24px ${accentColor}55` : undefined,
        }}
      >
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  let styleObj: React.CSSProperties = { backgroundColor: accentColor };
  let textColorClass = 'text-black';

  if (avatarStyle === 'obsidian-ring') {
    styleObj = {
      backgroundColor: '#000000',
      border: `2px solid ${accentColor}`,
      boxShadow: glow ? `0 0 22px ${accentColor}50` : undefined,
    };
    textColorClass = 'text-white';
  } else if (avatarStyle === 'glass-emblem') {
    styleObj = {
      background: `linear-gradient(135deg, ${accentColor}aa 0%, rgba(24,24,27,0.92) 100%)`,
      border: '1px solid rgba(255,255,255,0.22)',
      boxShadow: glow ? `0 0 22px ${accentColor}45` : undefined,
    };
    textColorClass = 'text-white';
  } else if (avatarStyle === 'halo') {
    styleObj = {
      background: `radial-gradient(circle at 30% 30%, ${accentColor}d0 0%, #141418 75%)`,
      boxShadow: glow
        ? `0 0 28px ${accentColor}75, inset 0 1px 0 rgba(255,255,255,0.3)`
        : 'inset 0 1px 0 rgba(255,255,255,0.25)',
    };
    textColorClass = 'text-white';
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-display font-bold select-none ${radiusClass} ${sizeClass} ${textClass} ${textColorClass} ${className}`}
      style={styleObj}
    >
      <span>{initials}</span>
    </div>
  );
};
