import { LyricLine, Track } from '../types/music';

const OFFLINE_DB_NAME = 'klyn_offline_db_v1';
const OFFLINE_DB_VERSION = 1;
const TRACKS_STORE = 'tracks';
const AUDIO_BLOBS_STORE = 'audio_blobs';
const LYRICS_STORE = 'lyrics';

const LEGACY_DB_NAME = 'klyn_offline_downloads_db';
const LEGACY_STORE_NAME = 'downloaded_tracks';
const DOWNLOAD_IDS_STORAGE_KEY = 'klyn_downloaded_track_ids_v1';
const DOWNLOAD_TRACKS_FALLBACK_KEY = 'klyn_downloaded_tracks_v1';

export interface OfflineTrackEntry {
  id: string;
  track: Track;
  coverUrl: string;
  cachedAt: number;
  updatedAt: number;
  byteSize: number;
  hasAudioBlob: boolean;
  sourceUrl?: string;
  isDownloaded: boolean;
}

export interface OfflineAudioBlobEntry {
  trackId: string;
  blob?: Blob;
  streamUrl?: string;
  mimeType?: string;
  byteSize: number;
  cachedAt: number;
}

export interface OfflineLyricsEntry {
  trackId: string;
  cacheKeys: string[];
  lines: LyricLine[];
  cachedAt: number;
  byteSize: number;
}

export interface OfflineStorageStats {
  downloadedCount: number;
  cachedCount: number;
  lyricsCount: number;
  totalBytes: number;
  formattedSize: string;
}

const memoryTracksFallback = new Map<string, OfflineTrackEntry>();
const memoryAudioFallback = new Map<string, OfflineAudioBlobEntry>();
const memoryLyricsFallback = new Map<string, OfflineLyricsEntry>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
let legacyMigrationDone = false;

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function estimateTrackMetadataBytes(track: Track, audioBlob?: Blob): number {
  const jsonBytes = (() => {
    try {
      return new TextEncoder().encode(JSON.stringify(track)).length;
    } catch {
      return 1024;
    }
  })();
  const blobBytes = audioBlob ? audioBlob.size : 0;
  // Estimate cover art + cached track footprint cleanly when audio is streamed via YouTube IFrame ID
  const coverBytes = track.coverUrl ? 48 * 1024 : 0;
  return jsonBytes + coverBytes + blobBytes;
}

function openOfflineDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = window.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TRACKS_STORE)) {
          db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(AUDIO_BLOBS_STORE)) {
          db.createObjectStore(AUDIO_BLOBS_STORE, { keyPath: 'trackId' });
        }
        if (!db.objectStoreNames.contains(LYRICS_STORE)) {
          db.createObjectStore(LYRICS_STORE, { keyPath: 'trackId' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function saveFallbackDownloadsToLocalStorage(entries: OfflineTrackEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const downloadedOnly = entries.filter((e) => e.isDownloaded);
    window.localStorage.setItem(
      DOWNLOAD_IDS_STORAGE_KEY,
      JSON.stringify(downloadedOnly.map((e) => e.id)),
    );
    window.localStorage.setItem(
      DOWNLOAD_TRACKS_FALLBACK_KEY,
      JSON.stringify(
        downloadedOnly.map((e) => ({
          track: { ...e.track, downloaded: true },
          downloadedAt: new Date(e.cachedAt).toISOString(),
        })),
      ),
    );
  } catch {
    // Ignore localStorage quota errors
  }
}

function loadFallbackDownloadsFromLocalStorage(): OfflineTrackEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DOWNLOAD_TRACKS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: { track?: Track; downloadedAt?: string }) => {
        if (!row?.track?.id) return null;
        const ts = row.downloadedAt ? new Date(row.downloadedAt).getTime() : Date.now();
        const cleanTrack: Track = { ...row.track, downloaded: true };
        return {
          id: cleanTrack.id,
          track: cleanTrack,
          coverUrl: cleanTrack.coverUrl ?? '',
          cachedAt: Number.isFinite(ts) ? ts : Date.now(),
          updatedAt: Number.isFinite(ts) ? ts : Date.now(),
          byteSize: estimateTrackMetadataBytes(cleanTrack),
          hasAudioBlob: false,
          sourceUrl: cleanTrack.youtubeId
            ? `https://www.youtube.com/watch?v=${cleanTrack.youtubeId}`
            : undefined,
          isDownloaded: true,
        } as OfflineTrackEntry;
      })
      .filter((item): item is OfflineTrackEntry => Boolean(item));
  } catch {
    return [];
  }
}

async function migrateLegacyDownloadsOnce(db: IDBDatabase): Promise<void> {
  if (legacyMigrationDone || typeof window === 'undefined' || !('indexedDB' in window)) {
    legacyMigrationDone = true;
    return;
  }
  legacyMigrationDone = true;

  try {
    const legacyRecords = await new Promise<Array<{ track: Track; downloadedAt?: string }>>(
      (resolve) => {
        const req = window.indexedDB.open(LEGACY_DB_NAME, 1);
        req.onsuccess = () => {
          const legacyDb = req.result;
          if (!legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            legacyDb.close();
            resolve([]);
            return;
          }
          const tx = legacyDb.transaction(LEGACY_STORE_NAME, 'readonly');
          const getAllReq = tx.objectStore(LEGACY_STORE_NAME).getAll();
          getAllReq.onsuccess = () => {
            legacyDb.close();
            resolve(Array.isArray(getAllReq.result) ? getAllReq.result : []);
          };
          getAllReq.onerror = () => {
            legacyDb.close();
            resolve([]);
          };
        };
        req.onerror = () => resolve([]);
      },
    );

    const lsFallback = loadFallbackDownloadsFromLocalStorage();
    const combined: Array<{ track: Track; cachedAt: number }> = [
      ...legacyRecords
        .filter((r) => Boolean(r?.track?.id))
        .map((r) => ({
          track: { ...r.track, downloaded: true },
          cachedAt: r.downloadedAt ? new Date(r.downloadedAt).getTime() || Date.now() : Date.now(),
        })),
      ...lsFallback.map((entry) => ({
        track: entry.track,
        cachedAt: entry.cachedAt,
      })),
    ];

    if (combined.length === 0) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(TRACKS_STORE, 'readwrite');
        const store = tx.objectStore(TRACKS_STORE);
        for (const item of combined) {
          const entry: OfflineTrackEntry = {
            id: item.track.id,
            track: item.track,
            coverUrl: item.track.coverUrl ?? '',
            cachedAt: item.cachedAt,
            updatedAt: Date.now(),
            byteSize: estimateTrackMetadataBytes(item.track),
            hasAudioBlob: false,
            sourceUrl: item.track.youtubeId
              ? `https://www.youtube.com/watch?v=${item.track.youtubeId}`
              : undefined,
            isDownloaded: true,
          };
          store.put(entry);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Non-fatal migration error
  }
}

export async function getCachedTrackEntry(trackId: string): Promise<OfflineTrackEntry | null> {
  if (!trackId) return null;
  const mem = memoryTracksFallback.get(trackId);
  if (mem) return mem;

  const db = await openOfflineDatabase();
  if (!db) {
    return loadFallbackDownloadsFromLocalStorage().find((e) => e.id === trackId) ?? null;
  }

  return await new Promise<OfflineTrackEntry | null>((resolve) => {
    try {
      const tx = db.transaction(TRACKS_STORE, 'readonly');
      const req = tx.objectStore(TRACKS_STORE).get(trackId);
      req.onsuccess = () => {
        const row = (req.result as OfflineTrackEntry | undefined) ?? null;
        if (row) memoryTracksFallback.set(row.id, row);
        resolve(row);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getCachedAudioBlobEntry(
  trackId: string,
): Promise<OfflineAudioBlobEntry | null> {
  if (!trackId) return null;
  const mem = memoryAudioFallback.get(trackId);
  if (mem) return mem;

  const db = await openOfflineDatabase();
  if (!db) return null;

  return await new Promise<OfflineAudioBlobEntry | null>((resolve) => {
    try {
      const tx = db.transaction(AUDIO_BLOBS_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_BLOBS_STORE).get(trackId);
      req.onsuccess = () => {
        const row = (req.result as OfflineAudioBlobEntry | undefined) ?? null;
        if (row) memoryAudioFallback.set(row.trackId, row);
        resolve(row);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheTrackOffline(
  track: Track,
  options?: {
    audioBlob?: Blob;
    audioUrl?: string;
    isDownloaded?: boolean;
  },
): Promise<OfflineTrackEntry> {
  const existing = await getCachedTrackEntry(track.id);
  const existingAudio = await getCachedAudioBlobEntry(track.id);
  const now = Date.now();
  const resolvedIsDownloaded =
    options?.isDownloaded !== undefined
      ? options.isDownloaded
      : Boolean(existing?.isDownloaded || track.downloaded);

  const mergedYoutubeId = track.youtubeId || existing?.track.youtubeId;
  const cleanTrack: Track = {
    ...existing?.track,
    ...track,
    youtubeId: mergedYoutubeId,
    downloaded: resolvedIsDownloaded,
  };

  const audioBlob = options?.audioBlob ?? existingAudio?.blob;
  const streamUrl =
    options?.audioUrl ??
    existingAudio?.streamUrl ??
    (mergedYoutubeId ? `https://www.youtube.com/watch?v=${mergedYoutubeId}` : undefined);

  const blobByteSize = audioBlob?.size ?? existingAudio?.byteSize ?? 0;
  const totalEntryBytes = estimateTrackMetadataBytes(cleanTrack, audioBlob);

  const trackEntry: OfflineTrackEntry = {
    id: cleanTrack.id,
    track: cleanTrack,
    coverUrl: cleanTrack.coverUrl ?? '',
    cachedAt: existing?.cachedAt ?? now,
    updatedAt: now,
    byteSize: totalEntryBytes,
    hasAudioBlob: Boolean(audioBlob),
    sourceUrl: streamUrl,
    isDownloaded: resolvedIsDownloaded,
  };

  memoryTracksFallback.set(trackEntry.id, trackEntry);

  const audioEntry: OfflineAudioBlobEntry | null =
    audioBlob || streamUrl
      ? {
          trackId: cleanTrack.id,
          blob: audioBlob,
          streamUrl,
          mimeType: audioBlob?.type || existingAudio?.mimeType,
          byteSize: blobByteSize,
          cachedAt: now,
        }
      : null;

  if (audioEntry) {
    memoryAudioFallback.set(cleanTrack.id, audioEntry);
  }

  if (resolvedIsDownloaded) {
    saveFallbackDownloadsToLocalStorage(Array.from(memoryTracksFallback.values()));
  }

  const db = await openOfflineDatabase();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const stores = audioEntry ? [TRACKS_STORE, AUDIO_BLOBS_STORE] : [TRACKS_STORE];
        const tx = db.transaction(stores, 'readwrite');
        tx.objectStore(TRACKS_STORE).put(trackEntry);
        if (audioEntry) {
          tx.objectStore(AUDIO_BLOBS_STORE).put(audioEntry);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return trackEntry;
}

export async function getAllOfflineTrackEntries(): Promise<OfflineTrackEntry[]> {
  const db = await openOfflineDatabase();
  if (!db) {
    const lsRows = loadFallbackDownloadsFromLocalStorage();
    for (const row of lsRows) {
      if (!memoryTracksFallback.has(row.id)) memoryTracksFallback.set(row.id, row);
    }
    return Array.from(memoryTracksFallback.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  await migrateLegacyDownloadsOnce(db);

  return await new Promise<OfflineTrackEntry[]>((resolve) => {
    try {
      const tx = db.transaction(TRACKS_STORE, 'readonly');
      const req = tx.objectStore(TRACKS_STORE).getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? (req.result as OfflineTrackEntry[]) : [];
        rows.forEach((r) => memoryTracksFallback.set(r.id, r));
        rows.sort((a, b) => (b.cachedAt ?? 0) - (a.cachedAt ?? 0));
        resolve(rows);
      };
      req.onerror = () => {
        resolve(loadFallbackDownloadsFromLocalStorage());
      };
    } catch {
      resolve(loadFallbackDownloadsFromLocalStorage());
    }
  });
}

export async function getDownloadedTracks(): Promise<Track[]> {
  const entries = await getAllOfflineTrackEntries();
  const downloaded = entries
    .filter((entry) => entry.isDownloaded)
    .map((entry) => ({ ...entry.track, downloaded: true }));

  if (downloaded.length > 0) {
    return downloaded;
  }

  // Merge localStorage fallback if IndexedDB has not been populated yet
  const lsRows = loadFallbackDownloadsFromLocalStorage();
  return lsRows.map((r) => ({ ...r.track, downloaded: true }));
}

export async function removeCachedTrack(trackId: string): Promise<void> {
  memoryTracksFallback.delete(trackId);
  memoryAudioFallback.delete(trackId);

  const remainingLs = loadFallbackDownloadsFromLocalStorage().filter((e) => e.id !== trackId);
  saveFallbackDownloadsToLocalStorage(remainingLs);

  const db = await openOfflineDatabase();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([TRACKS_STORE, AUDIO_BLOBS_STORE], 'readwrite');
      tx.objectStore(TRACKS_STORE).delete(trackId);
      tx.objectStore(AUDIO_BLOBS_STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearDownloadedTracks(): Promise<void> {
  try {
    for (const [id, entry] of memoryTracksFallback.entries()) {
      if (entry.isDownloaded) {
        memoryTracksFallback.delete(id);
        memoryAudioFallback.delete(id);
      }
    }
    saveFallbackDownloadsToLocalStorage([]);

    const db = await openOfflineDatabase();
    if (!db) return;

    const entries = await getAllOfflineTrackEntries();
    const downloadedIds = entries.filter((e) => e.isDownloaded).map((e) => e.id);
    if (downloadedIds.length === 0) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([TRACKS_STORE, AUDIO_BLOBS_STORE], 'readwrite');
        const trackStore = tx.objectStore(TRACKS_STORE);
        const blobStore = tx.objectStore(AUDIO_BLOBS_STORE);
        for (const id of downloadedIds) {
          trackStore.delete(id);
          blobStore.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Graceful fallback when IndexedDB is restricted
  }
}

export async function saveCachedLyrics(
  trackId: string,
  cacheKeys: string[],
  lines: LyricLine[],
): Promise<void> {
  if (!trackId || lines.length === 0) return;
  try {
    const byteSize = (() => {
      try {
        return new TextEncoder().encode(JSON.stringify(lines)).length;
      } catch {
        return lines.length * 48;
      }
    })();

    const entry: OfflineLyricsEntry = {
      trackId,
      cacheKeys: Array.from(new Set(cacheKeys.filter(Boolean))),
      lines,
      cachedAt: Date.now(),
      byteSize,
    };
    memoryLyricsFallback.set(trackId, entry);

    const db = await openOfflineDatabase();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(LYRICS_STORE, 'readwrite');
        tx.objectStore(LYRICS_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Non-fatal cache write failure
  }
}

export async function getCachedLyrics(keys: string[]): Promise<LyricLine[] | null> {
  const cleanKeys = keys.filter(Boolean);
  if (cleanKeys.length === 0) return null;

  try {
    for (const key of cleanKeys) {
      const direct = memoryLyricsFallback.get(key);
      if (direct && direct.lines.length > 0) return direct.lines;
    }

    const db = await openOfflineDatabase();
    if (!db) return null;

    return await new Promise<LyricLine[] | null>((resolve) => {
      try {
        const tx = db.transaction(LYRICS_STORE, 'readonly');
        const store = tx.objectStore(LYRICS_STORE);
        const firstReq = store.get(cleanKeys[0]);
        firstReq.onsuccess = () => {
          const directRow = firstReq.result as OfflineLyricsEntry | undefined;
          if (directRow && directRow.lines.length > 0) {
            memoryLyricsFallback.set(directRow.trackId, directRow);
            resolve(directRow.lines);
            return;
          }
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const allRows = Array.isArray(allReq.result)
              ? (allReq.result as OfflineLyricsEntry[])
              : [];
            const matched = allRows.find(
              (row) =>
                cleanKeys.includes(row.trackId) ||
                row.cacheKeys?.some((ck) => cleanKeys.includes(ck)),
            );
            if (matched && matched.lines.length > 0) {
              memoryLyricsFallback.set(matched.trackId, matched);
              resolve(matched.lines);
              return;
            }
            resolve(null);
          };
          allReq.onerror = () => resolve(null);
        };
        firstReq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function getOfflineStorageStats(): Promise<OfflineStorageStats> {
  try {
    const entries = await getAllOfflineTrackEntries();
    const downloadedEntries = entries.filter((e) => e.isDownloaded);
    let totalBytes = downloadedEntries.reduce((sum, item) => sum + (item.byteSize ?? 0), 0);

    const db = await openOfflineDatabase();
    let lyricsCount = memoryLyricsFallback.size;

    if (db) {
      const lyricsMeta = await new Promise<{ count: number; bytes: number }>((resolve) => {
        try {
          const tx = db.transaction(LYRICS_STORE, 'readonly');
          const req = tx.objectStore(LYRICS_STORE).getAll();
          req.onsuccess = () => {
            const rows = Array.isArray(req.result) ? (req.result as OfflineLyricsEntry[]) : [];
            resolve({
              count: rows.length,
              bytes: rows.reduce((sum, r) => sum + (r.byteSize ?? 0), 0),
            });
          };
          req.onerror = () => resolve({ count: memoryLyricsFallback.size, bytes: 0 });
        } catch {
          resolve({ count: memoryLyricsFallback.size, bytes: 0 });
        }
      });
      lyricsCount = lyricsMeta.count;
      totalBytes += lyricsMeta.bytes;
    }

    for (const entry of entries) {
      if (!entry.isDownloaded) {
        totalBytes += entry.byteSize ?? 0;
      }
    }

    return {
      downloadedCount: downloadedEntries.length,
      cachedCount: entries.length,
      lyricsCount,
      totalBytes,
      formattedSize: formatByteSize(totalBytes),
    };
  } catch {
    return {
      downloadedCount: 0,
      cachedCount: 0,
      lyricsCount: 0,
      totalBytes: 0,
      formattedSize: '0 B',
    };
  }
}
