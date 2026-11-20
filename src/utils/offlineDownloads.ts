import { Track } from '../types/music';
import {
  cacheTrackOffline,
  clearDownloadedTracks,
  getDownloadedTracks,
  removeCachedTrack,
} from '../services/offlineCache';

export interface OfflineDownloadedRecord {
  track: Track;
  downloadedAt: string;
}

export async function loadOfflineDownloadedTracks(): Promise<Track[]> {
  return await getDownloadedTracks();
}

export async function saveOfflineDownloadedTrack(track: Track): Promise<void> {
  await cacheTrackOffline(track, { isDownloaded: true });
}

export async function removeOfflineDownloadedTrack(trackId: string): Promise<void> {
  await removeCachedTrack(trackId);
}

export async function clearAllOfflineDownloadedTracks(): Promise<void> {
  await clearDownloadedTracks();
}
