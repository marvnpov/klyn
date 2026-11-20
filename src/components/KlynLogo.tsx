import React from 'react';

interface KlynLogoProps {
  size?: number;
  className?: string;
  alt?: string;
  pulse?: boolean;
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

export const KlynLogo: React.FC<KlynLogoProps> = ({
  size,
  className = '',
  alt = 'KLYN',
  pulse = false,
  withWordmark = false,
  wordmarkClassName = 'font-display text-lg font-bold tracking-tight text-white',
}) => {
  const defaultClasses = size
    ? 'rounded-xl'
    : className
      ? ''
      : 'h-9 w-9 rounded-xl';

  const img = (
    <img
      src="/klyn-logo.png"
      alt={alt}
      draggable={false}
      style={size ? { width: size, height: size } : undefined}
      className={`object-cover select-none ${defaultClasses} ${pulse ? 'animate-klyn-bounce-pulse' : ''} ${className}`.trim()}
    />
  );

  if (!withWordmark) return img;

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap">
      {img}
      <span className={wordmarkClassName}>klyn</span>
    </span>
  );
};
