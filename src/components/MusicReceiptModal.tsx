import React, { useState } from 'react';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { ArtistPlayStat, formatTime } from '../data/catalog';
import { ActivityPeriod, Track } from '../types/music';
import { BrandLogo } from './BrandLogo';

interface MusicReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: ActivityPeriod;
  totalTime: string;
  tracksPlayed: number;
  streakDays: number;
  artistStats: ArtistPlayStat[];
  tracks: Track[];
}

export const MusicReceiptModal: React.FC<MusicReceiptModalProps> = ({
  isOpen,
  onClose,
  period,
  totalTime,
  tracksPlayed,
  streakDays,
  artistStats,
  tracks,
}) => {
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const topTracksList = artistStats
    .slice(0, 4)
    .map((stat) => ({
      stat,
      track: tracks.find((t) => t.id === stat.topTrackId),
    }))
    .filter((entry): entry is { stat: ArtistPlayStat; track: Track } => Boolean(entry.track));

  const generateReceiptCanvasBlob = async (): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1080, 1920);

    // Subtle top ambient gradient
    const grad = ctx.createRadialGradient(540, 260, 60, 540, 320, 820);
    grad.addColorStop(0, 'rgba(255,255,255,0.14)');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Receipt sheet
    ctx.fillStyle = '#111114';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(110, 150, 860, 1620, 42);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 52px sans-serif';
    ctx.fillText('KLYN AUDIO', 175, 265);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 26px monospace';
    ctx.fillText(`LISTENER SUMMARY · ${period.toUpperCase()}`, 175, 315);
    ctx.fillText(`STREAK: ${streakDays} DAYS  |  PLAYS: ${tracksPlayed}`, 175, 355);

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(175, 400);
    ctx.lineTo(905, 400);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 24px monospace';
    ctx.fillText('TOP TRACKS & PLAYS', 175, 455);

    let y = 515;
    topTracksList.forEach(({ stat, track }, i) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 32px monospace';
      ctx.fillText(`0${i + 1}  ${track.title.slice(0, 22)}`, 175, y);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(`${stat.topTrackPlays}x`, 820, y);
      ctx.font = '500 24px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(`    ${track.artist} · ${formatTime(track.duration)}`, 175, y + 36);
      y += 105;
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(175, y + 10);
    ctx.lineTo(905, y + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    y += 75;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 24px monospace';
    ctx.fillText('ARTIST SHARE BREAKDOWN', 175, y);
    y += 55;

    artistStats.slice(0, 4).forEach((stat) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 28px monospace';
      ctx.fillText(stat.artistName.slice(0, 24), 175, y);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`${stat.sharePct}% (${stat.minutes}m)`, 685, y);
      y += 56;
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(175, 1465);
    ctx.lineTo(905, 1465);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 38px monospace';
    ctx.fillText('TOTAL LISTENING', 175, 1545);
    ctx.fillText(totalTime, 690, 1545);

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 22px monospace';
    ctx.fillText('THANK YOU FOR LISTENING IN LOSSLESS · KLYN', 175, 1625);

    // Barcode lines
    for (let x = 180; x < 890; x += 14) {
      const w = (x * 7) % 9 === 0 ? 7 : 3;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillRect(x, 1665, w, 58);
    }

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  };

  const triggerDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `klyn-summary-${period.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleShareStory = async () => {
    setIsExporting(true);
    try {
      const blob = await generateReceiptCanvasBlob();
      if (!blob) return;
      const file = new File([blob], 'klyn-listening-summary.png', { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: `klyn Listening Summary (${period})`,
          text: `${totalTime} listened · Top Artist: ${artistStats[0]?.artistName ?? 'My Rotation'}`,
          files: [file],
        });
        setStatusMessage('Shared summary card');
      } else {
        triggerDownload(blob);
        setStatusMessage('Saved summary PNG — ready for Instagram Stories');
      }
    } catch {
      setStatusMessage('Summary ready via PNG download');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const blob = await generateReceiptCanvasBlob();
      if (blob) {
        triggerDownload(blob);
        setStatusMessage('Downloaded 1080×1920 PNG');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = () => {
    const lines = [
      `KLYN LISTENING SUMMARY (${period})`,
      `Total: ${totalTime} | Plays: ${tracksPlayed} | Streak: ${streakDays}d`,
      ...topTracksList.map(
        ({ stat, track }, i) => `0${i + 1}. ${track.title} — ${track.artist} (${stat.topTrackPlays} plays)`,
      ),
    ].join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(lines).catch(() => {});
    }
    setCopied(true);
    setStatusMessage('Copied summary text');
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4 backdrop-blur-lg"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Listening Analysis Summary"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto no-scrollbar rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-3">
          <p className="text-xs font-semibold text-white/60">Listening &amp; Artist Analysis</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close summary"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Dark Thermal / Editorial Receipt Surface */}
        <div className="rounded-2xl border border-white/15 bg-zinc-950/90 p-5 font-mono text-xs text-white shadow-inner">
          <div className="text-center border-b border-dashed border-white/20 pb-3.5">
            <div className="inline-flex items-center justify-center gap-2">
              <BrandLogo className="h-5 w-5 rounded-md" />
              <p className="font-display text-lg font-bold tracking-tight text-white">klyn</p>
            </div>
            <p className="mt-1 text-[10px] tracking-[0.16em] uppercase text-white/55">
              AUDIO ARCHIVE · {period}
            </p>
            <p className="mt-1 text-[10px] text-white/45 tabular-nums">
              STREAK: {streakDays} DAYS · TRACKS: {tracksPlayed}
            </p>
          </div>

          <div className="py-3.5 border-b border-dashed border-white/20 space-y-2">
            <div className="flex justify-between text-[10px] text-white/50 uppercase">
              <span>Top Tracks</span>
              <span>Plays</span>
            </div>
            {topTracksList.map(({ stat, track }, idx) => (
              <div key={track.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    0{idx + 1} {track.title}
                  </p>
                  <p className="truncate text-[10px] text-white/50">
                    {track.artist} · {formatTime(track.duration)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-white/85">
                  {stat.topTrackPlays}×
                </span>
              </div>
            ))}
          </div>

          <div className="py-3.5 border-b border-dashed border-white/20 space-y-2">
            <div className="flex justify-between text-[10px] text-white/50 uppercase">
              <span>Top Artists</span>
              <span>Share / Min</span>
            </div>
            {artistStats.map((stat) => (
              <div key={stat.artistName} className="flex items-center justify-between gap-2">
                <span className="truncate text-white/90">{stat.artistName}</span>
                <span className="shrink-0 tabular-nums text-white/65">
                  {stat.sharePct}% · {stat.minutes}m
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3.5 space-y-3">
            <div className="flex items-baseline justify-between font-bold text-sm text-white">
              <span>TOTAL TIME</span>
              <span className="tabular-nums">{totalTime}</span>
            </div>

            {/* Minimal vector barcode */}
            <div aria-hidden="true" className="flex h-8 w-full items-stretch justify-between gap-[2px] opacity-70 pt-1">
              {Array.from({ length: 36 }).map((_, i) => (
                <span
                  key={i}
                  className="bg-white"
                  style={{ width: i % 4 === 0 ? '3px' : i % 3 === 0 ? '2px' : '1px' }}
                />
              ))}
            </div>
          </div>
        </div>

        {statusMessage && (
          <p className="mt-3 text-center text-xs font-medium text-white/80">{statusMessage}</p>
        )}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={handleShareStory}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-black hover:scale-[1.01] active:scale-95 transition-transform"
          >
            <Share2 className="h-4 w-4" />
            <span>Share to Instagram Stories</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownload}
              className="liquid-glass flex items-center justify-center gap-1.5 rounded-full py-2 px-3 text-xs font-semibold text-white/90 hover:bg-white/12"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="liquid-glass flex items-center justify-center gap-1.5 rounded-full py-2 px-3 text-xs font-semibold text-white/90 hover:bg-white/12"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
