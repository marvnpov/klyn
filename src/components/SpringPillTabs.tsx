import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PillTabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface SpringPillTabsProps<T extends string> {
  items: PillTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  variant?: 'hug' | 'equal';
  size?: 'sm' | 'md' | 'nav';
  className?: string;
  thumbClassName?: string;
  ariaLabel?: string;
}

export function SpringPillTabs<T extends string>({
  items,
  activeId,
  onChange,
  variant = 'hug',
  size = 'sm',
  className = '',
  thumbClassName = 'liquid-glass-pill-thumb',
  ariaLabel = 'Tab switcher',
}: SpringPillTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumbStyle, setThumbStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const itemsKey = items.map((item) => `${item.id}:${item.label}`).join('|');

  const measureActiveThumb = useCallback(() => {
    const activeButton = buttonRefs.current[activeId];
    if (!activeButton) return;
    const nextLeft = activeButton.offsetLeft;
    const nextWidth = activeButton.offsetWidth;
    setThumbStyle((prev) =>
      prev.ready && prev.left === nextLeft && prev.width === nextWidth
        ? prev
        : { left: nextLeft, width: nextWidth, ready: true },
    );
  }, [activeId]);

  useLayoutEffect(() => {
    measureActiveThumb();
  }, [measureActiveThumb, itemsKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureActiveThumb);
      return () => window.removeEventListener('resize', measureActiveThumb);
    }

    const observer = new ResizeObserver(() => {
      measureActiveThumb();
    });
    observer.observe(container);
    Object.values(buttonRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [measureActiveThumb, itemsKey]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex items-center rounded-full ${
        variant === 'equal' ? 'grid w-full' : 'inline-flex'
      } ${className}`}
      style={
        variant === 'equal'
          ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {/* Spring-animated sliding pill thumb */}
      <span
        aria-hidden="true"
        className={`spring-slider-thumb pointer-events-none absolute top-1 bottom-1 left-0 rounded-full ${thumbClassName}`}
        style={{
          transform: `translate3d(${thumbStyle.left}px, 0, 0)`,
          width: `${thumbStyle.width}px`,
          opacity: thumbStyle.ready ? 1 : 0,
        }}
      />

      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`relative z-10 flex items-center justify-center rounded-full whitespace-nowrap shrink-0 select-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              size === 'nav'
                ? 'flex-col gap-0.5 py-1.5 px-2 text-[10px] font-medium tracking-tight min-h-[44px]'
                : size === 'md'
                  ? 'gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium min-h-[38px]'
                  : 'gap-1.5 px-3.5 py-1.5 text-xs sm:text-[13px] font-medium min-h-[34px]'
            } ${isActive ? 'text-white' : 'text-white/55 hover:text-white/85'}`}
          >
            {item.icon}
            <span className={size === 'nav' ? 'leading-none' : ''}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
