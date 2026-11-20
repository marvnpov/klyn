import React, { useCallback, useRef, useState } from 'react';
import { formatTime } from '../data/catalog';

interface ExpandingScrubberProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  showTimestamps?: boolean;
  compact?: boolean;
  className?: string;
}

export const ExpandingScrubber: React.FC<ExpandingScrubberProps> = ({
  currentTime,
  duration,
  onSeek,
  showTimestamps = true,
  compact = false,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const safeDuration = Math.max(duration, 1);
  const progress = Math.min(1, Math.max(0, currentTime / safeDuration));
  const remaining = Math.max(0, safeDuration - currentTime);

  const calculateTimeFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return currentTime;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * safeDuration;
    },
    [currentTime, safeDuration],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onSeek(calculateTimeFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    onSeek(calculateTimeFromClientX(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeek(Math.min(safeDuration, currentTime + 5));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - 5));
    }
  };

  const isExpanded = isDragging || isHovered;

  return (
    <div className={`w-full select-none ${className}`}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Playback scrubber"
        aria-valuemin={0}
        aria-valuemax={Math.floor(safeDuration)}
        aria-valuenow={Math.floor(currentTime)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={handleKeyDown}
        className={`group relative flex w-full cursor-pointer items-center touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-full ${
          compact ? 'py-2' : 'py-2.5'
        }`}
      >
        <div
          className="relative w-full overflow-hidden rounded-full bg-white/18"
          style={{
            height: isExpanded ? '8px' : '4px',
            transition: 'height 0.2s ease',
          }}
        >
          <div
            className="h-full rounded-full bg-white"
            style={{
              width: `${progress * 100}%`,
              boxShadow: isExpanded ? '0 0 14px rgba(255, 255, 255, 0.75)' : '0 0 8px rgba(255, 255, 255, 0.35)',
              transition: isDragging ? 'none' : 'width 0.15s linear',
            }}
          />
        </div>
      </div>

      {showTimestamps && (
        <div className="mt-0.5 flex items-center justify-between text-[11px] font-medium text-white/55 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(remaining)}</span>
        </div>
      )}
    </div>
  );
};
