import React, { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface CoverArtProps {
  src: string;
  alt: string;
  fallbackGradient?: string;
  className?: string;
  imgClassName?: string;
}

export const CoverArt: React.FC<CoverArtProps> = ({
  src,
  alt,
  fallbackGradient = 'linear-gradient(135deg, #27272a 0%, #09090b 100%)',
  className = '',
  imgClassName = '',
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={`relative overflow-hidden bg-zinc-950 select-none ${className}`}
      style={{ background: fallbackGradient }}
    >
      {!hasError ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setHasError(true)}
          className={`h-full w-full bg-zinc-950 object-cover ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950">
          <Disc3 className="h-1/3 w-1/3 text-white/45" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
};
