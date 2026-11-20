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

  if (cleanAvatar) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full bg-zinc-900 ${sizeClass} ${className}`}
        style={{
          boxShadow: glow ? `0 0 28px ${accentColor}44` : undefined,
        }}
      >
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full rounded-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold select-none text-white ${sizeClass} ${textClass} ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${accentColor} 0%, #1c1c20 92%)`,
        boxShadow: glow ? `0 0 26px ${accentColor}44` : undefined,
      }}
    >
      <span>{initials}</span>
    </div>
  );
};
