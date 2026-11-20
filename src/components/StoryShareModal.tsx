import React, { useState } from 'react';
import { Check, Copy, Download, Share2, Sparkles, X } from 'lucide-react';
import { ActivityPeriod, Track } from '../types/music';
import { BrandLogo } from './BrandLogo';
import { CoverArt } from './CoverArt';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';

type StoryTheme = 'Obsidian Glass' | 'Klyn Mono' | 'Ambient Glow';

interface StoryShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: ActivityPeriod;
  totalTime: string;
  tracksPlayed: number;
  vibeLabel: string;
  topArtistName: string;
  topTrack: Track | null;
}

const STORY_THEMES: PillTabItem<StoryTheme>[] = [
  { id: 'Obsidian Glass', label: 'Obsidian Glass' },
  { id: 'Klyn Mono', label: 'Klyn Mono' },
  { id: 'Ambient Glow', label: 'Ambient Glow' },
];

export const StoryShareModal: React.FC<StoryShareModalProps> = ({
  isOpen,
  onClose,
  period,
  totalTime,
  tracksPlayed,
  vibeLabel,
  topArtistName,
  topTrack,
}) => {
  const [theme, setTheme] = useState<StoryTheme>('Obsidian Glass');
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !topTrack) return null;

  const generateStoryCanvasBlob = async (): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background fill
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1080, 1920);

    if (theme === 'Ambient Glow') {
      const grad = ctx.createRadialGradient(540, 620, 80, 540, 680, 960);
      grad.addColorStop(0, `${topTrack.primaryColor}cc`);
      grad.addColorStop(0.5, `${topTrack.secondaryColor}88`);
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
    } else if (theme === 'Obsidian Glass') {
      const grad = ctx.createRadialGradient(540, 420, 60, 540, 640, 820);
      grad.addColorStop(0, `${topTrack.primaryColor}55`);
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
      grad.addColorStop(0, '#18181b');
      grad.addColorStop(0.5, '#09090b');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
    }

    // Glass card frame
    ctx.save();
    ctx.fillStyle = theme === 'Klyn Mono' ? 'rgba(255,255,255,0.06)' : 'rgba(24,24,27,0.62)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(90, 180, 900, 1560, 64);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Header text
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '600 32px sans-serif';
    ctx.fillText(`KLYN WRAPPED · ${period.toUpperCase()}`, 160, 290);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 68px sans-serif';
    ctx.fillText('Your Soundscape', 160, 380);

    // Load cover image safely
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = topTrack.coverUrl;
      });
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(160, 445, 760, 760, 48);
      ctx.clip();
      ctx.drawImage(img, 160, 445, 760, 760);
      ctx.restore();
    } catch {
      ctx.fillStyle = topTrack.primaryColor;
      ctx.beginPath();
      ctx.roundRect(160, 445, 760, 760, 48);
      ctx.fill();
    }

    // Metadata
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = '600 28px sans-serif';
    ctx.fillText('TOP ARTIST', 160, 1295);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 48px sans-serif';
    ctx.fillText(topArtistName, 160, 1358);

    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = '600 28px sans-serif';
    ctx.fillText('TOP SONG', 160, 1445);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 44px sans-serif';
    ctx.fillText(topTrack.title, 160, 1506);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 32px sans-serif';
    ctx.fillText(`${totalTime} listened · ${tracksPlayed} plays`, 160, 1595);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 26px sans-serif';
    ctx.fillText(vibeLabel, 160, 1650);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 32px sans-serif';
    ctx.fillText('klyn', 855, 1660);

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  };

  const triggerDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `klyn-wrapped-${period.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleShareToInstagram = async () => {
    setIsExporting(true);
    try {
      const blob = await generateStoryCanvasBlob();
      if (!blob) {
        setStatusMessage('Unable to render Story image in this browser');
        return;
      }

      const file = new File([blob], 'klyn-wrapped-story.png', { type: 'image/png' });
      const shareData: ShareData = {
        title: `My Klyn Wrapped (${period})`,
        text: `Top Artist: ${topArtistName} · Top Song: ${topTrack.title} · ${totalTime} on klyn`,
        files: [file],
      };

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share(shareData);
        setStatusMessage('Shared Story card');
      } else {
        triggerDownload(blob);
        setStatusMessage('Saved 9:16 Story PNG — ready to post to Instagram Stories');
      }
    } catch {
      setStatusMessage('Share cancelled or ready via PNG download');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPng = async () => {
    setIsExporting(true);
    try {
      const blob = await generateStoryCanvasBlob();
      if (blob) {
        triggerDownload(blob);
        setStatusMessage('Downloaded 1080×1920 Story PNG');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyCaption = () => {
    const caption = `My Klyn Wrapped (${period}): ${totalTime} listened · #1 Artist: ${topArtistName} · Top Song: "${topTrack.title}" (${vibeLabel}) #klyn`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(caption).catch(() => {});
    }
    setCopied(true);
    setStatusMessage('Copied Story caption to clipboard');
    window.setTimeout(() => setCopied(false), 1800);
  };

  const cardBgStyle =
    theme === 'Ambient Glow'
      ? {
          background: `radial-gradient(circle at 50% 25%, ${topTrack.primaryColor}cc 0%, ${topTrack.secondaryColor}88 48%, #050507 100%)`,
        }
      : theme === 'Obsidian Glass'
        ? {
            background: `radial-gradient(circle at 50% 18%, ${topTrack.primaryColor}4d 0%, rgba(16,16,20,0.96) 65%, #000000 100%)`,
          }
        : {
            background: 'linear-gradient(155deg, #1b1b1f 0%, #09090b 65%, #000000 100%)',
          };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-lg"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share Klyn Wrapped to Instagram Stories"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto no-scrollbar rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-white/55">Instagram Stories</p>
            <h2 className="font-display text-lg font-bold text-white">Klyn Wrapped Story</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Story preview"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Theme Switcher */}
        <div className="mt-4 flex justify-center">
          <SpringPillTabs
            items={STORY_THEMES}
            activeId={theme}
            onChange={setTheme}
            variant="hug"
            size="sm"
            ariaLabel="Story card theme"
            className="liquid-glass p-1"
          />
        </div>

        {/* Vertical 9:16 Story Card Preview */}
        <div className="mt-4 flex justify-center">
          <div
            className="relative flex aspect-[9/16] w-full max-w-[250px] flex-col justify-between overflow-hidden rounded-3xl border border-white/20 p-4 shadow-2xl"
            style={cardBgStyle}
          >
            <div>
              <div className="flex items-center justify-between text-[9px] font-bold tracking-[0.14em] uppercase text-white/70">
                <span>KLYN WRAPPED</span>
                <span>{period}</span>
              </div>
              <h3 className="font-display mt-1 text-lg font-bold text-white leading-tight">
                Your Soundscape
              </h3>
            </div>

            <CoverArt
              src={topTrack.coverUrl}
              alt={topTrack.title}
              fallbackGradient={topTrack.fallbackGradient}
              className="mx-auto my-2 aspect-square w-full rounded-2xl border border-white/15 shadow-xl"
            />

            <div className="space-y-2 rounded-2xl bg-black/45 p-3 backdrop-blur-md border border-white/12">
              <div>
                <p className="text-[9px] font-semibold tracking-wider uppercase text-white/50">
                  Top Artist
                </p>
                <p className="truncate text-xs font-bold text-white">{topArtistName}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold tracking-wider uppercase text-white/50">
                  Top Song
                </p>
                <p className="truncate text-xs font-bold text-white">{topTrack.title}</p>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-white/75">
                <span className="tabular-nums font-semibold">
                  {totalTime} · {tracksPlayed} plays
                </span>
                <span className="inline-flex items-center gap-1.5 font-display font-bold text-white">
                  <BrandLogo className="h-4 w-4 rounded-[4px]" />
                  <span>klyn</span>
                </span>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-white/60">
                <Sparkles className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{vibeLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {statusMessage && (
          <p className="mt-3 text-center text-xs font-medium text-white/80">
            {statusMessage}
          </p>
        )}

        {/* Share & Export Actions */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={handleShareToInstagram}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 px-4 text-sm font-semibold text-black transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
            <span>{isExporting ? 'Preparing Story...' : 'Share to Instagram Stories'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadPng}
              className="liquid-glass flex items-center justify-center gap-1.5 rounded-full py-2.5 px-3 text-xs font-semibold text-white/90 hover:bg-white/12 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Story PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopyCaption}
              className="liquid-glass flex items-center justify-center gap-1.5 rounded-full py-2.5 px-3 text-xs font-semibold text-white/90 hover:bg-white/12 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Story Caption'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
