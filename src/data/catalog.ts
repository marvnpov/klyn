import { AudioDevice } from '../types/music';

export const SEARCH_GENRES = [
  { id: 'g-elec', name: 'Electronic', color: '#8A5224' },
  { id: 'g-rnb', name: 'Alt-R&B', color: '#7D2332' },
  { id: 'g-lofi', name: 'Lo-Fi', color: '#1E527D' },
  { id: 'g-ambient', name: 'Ambient', color: '#2F5E48' },
  { id: 'g-indie', name: 'Indie', color: '#394F57' },
  { id: 'g-soul', name: 'Neo-Soul', color: '#611D2D' },
  { id: 'g-house', name: 'House', color: '#265370' },
  { id: 'g-classical', name: 'Classical', color: '#6E532E' },
];

export const DEFAULT_OUTPUT_DEVICE: AudioDevice = {
  id: 'system-default',
  name: 'This Device · System Output',
  type: 'desktop',
  detail: 'Active Browser Audio Output',
  source: 'system',
  connected: true,
};

export const AUDIO_DEVICES: AudioDevice[] = [DEFAULT_OUTPUT_DEVICE];

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatPlays(plays: number): string {
  if (plays >= 1_000_000) return `${(plays / 1_000_000).toFixed(1)}M`;
  if (plays >= 1_000) return `${Math.round(plays / 1_000)}K`;
  return String(plays);
}

export function formatDurationSummary(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ArtistPlayStat {
  artistName: string;
  plays: number;
  minutes: number;
  sharePct: number;
  topTrackId: string;
  topTrackPlays: number;
}
