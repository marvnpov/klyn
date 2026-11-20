import { getCachedLyrics, saveCachedLyrics } from '../services/offlineCache';
import { LyricLine } from '../types/music';

interface LrcLibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

const LYRICS_STORAGE_KEY = 'klyn_lyrics_cache_v1';
const MAX_STORED_ENTRIES = 80;
const LRCLIB_TIMEOUT_MS = 2500;

const memoryLyricsCache = new Map<string, LyricLine[]>();

function loadStoredLyricsMap(): Record<string, LyricLine[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LYRICS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LyricLine[]>) : {};
  } catch {
    return {};
  }
}

function saveToStoredLyricsMap(keys: string[], lines: LyricLine[]): void {
  if (typeof window === 'undefined' || lines.length === 0) return;
  try {
    const map = loadStoredLyricsMap();
    for (const k of keys) {
      if (k) map[k] = lines;
    }
    const entries = Object.entries(map);
    const trimmed =
      entries.length > MAX_STORED_ENTRIES
        ? Object.fromEntries(entries.slice(entries.length - MAX_STORED_ENTRIES))
        : map;
    window.localStorage.setItem(LYRICS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

export function cleanTrackTitle(title: string): string {
  return title
    .replace(
      /\((?:feat\.?|ft\.?|with|from|remix|deluxe|edition|explicit|bonus|radio edit|live)[^)]*\)/gi,
      '',
    )
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      /\s*[-–—]\s*(single|remaster(?:ed)?(?:\s+\d{4})?|explicit|deluxe(?:\s+edition)?|live.*)$/i,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function getPrimaryArtist(artist: string): string {
  const split = artist.split(/\s*(?:,|&|feat\.?|ft\.?|×|\/|\bx\b)\s*/i)[0];
  return (split || artist).trim();
}

export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const parsed: LyricLine[] = [];
  const timeTagRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const metaTagRegex = /^\s*\[(?:ar|ti|al|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;

  for (const rawLine of lines) {
    if (!rawLine.trim() || metaTagRegex.test(rawLine)) continue;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    timeTagRegex.lastIndex = 0;

    while ((match = timeTagRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const millis =
        fracRaw.length === 1
          ? parseInt(fracRaw, 10) * 100
          : fracRaw.length === 2
            ? parseInt(fracRaw, 10) * 10
            : parseInt(fracRaw.slice(0, 3), 10);
      timestamps.push(minutes * 60 + seconds + millis / 1000);
    }

    if (timestamps.length === 0) continue;
    const text = rawLine.replace(timeTagRegex, '').trim();
    if (!text) continue;

    for (const time of timestamps) {
      parsed.push({ time, text });
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

export function parsePlainLyrics(plainText: string): LyricLine[] {
  if (!plainText) return [];
  return plainText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ time: -1, text }));
}

export async function fetchSyncedLyrics(
  trackName: string,
  artistName: string,
  signal?: AbortSignal,
  trackId?: string,
): Promise<LyricLine[]> {
  const rawTitle = trackName.trim();
  const rawArtist = artistName.trim();
  if (!rawTitle) return [];

  const strippedTitle = cleanTrackTitle(rawTitle) || rawTitle;
  const primaryArtist = getPrimaryArtist(rawArtist) || rawArtist;
  const textCacheKey = `${strippedTitle.toLowerCase()}::${primaryArtist.toLowerCase()}`;
  const cacheKeys = trackId ? [trackId, textCacheKey] : [textCacheKey];

  // 1. In-memory cache check
  for (const k of cacheKeys) {
    const mem = memoryLyricsCache.get(k);
    if (mem) return mem;
  }

  // 2. Persistent localStorage cache (klyn_lyrics_cache_v1)
  const storedMap = loadStoredLyricsMap();
  for (const k of cacheKeys) {
    const saved = storedMap[k];
    if (Array.isArray(saved) && saved.length > 0) {
      for (const ck of cacheKeys) memoryLyricsCache.set(ck, saved);
      return saved;
    }
  }

  // 2b. IndexedDB lyrics store cache (klyn_offline_db_v1)
  const idbLyrics = await getCachedLyrics(cacheKeys);
  if (idbLyrics && idbLyrics.length > 0) {
    for (const ck of cacheKeys) memoryLyricsCache.set(ck, idbLyrics);
    saveToStoredLyricsMap(cacheKeys, idbLyrics);
    return idbLyrics;
  }

  if (signal?.aborted) return [];

  // Strict 2500ms overall deadline across /api/get and fallback /api/search
  const masterController = new AbortController();
  const deadlineTimer = window.setTimeout(() => masterController.abort(), LRCLIB_TIMEOUT_MS);
  const onExternalAbort = () => masterController.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  let plainFallback: LyricLine[] = [];

  try {
    // 3. Direct lookup on LRCLIB with cleaned title + primary artist
    const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
      strippedTitle,
    )}&artist_name=${encodeURIComponent(primaryArtist)}`;

    try {
      const getRes = await fetch(getUrl, { signal: masterController.signal });
      if (getRes.ok) {
        const record = (await getRes.json()) as LrcLibRecord;
        if (record.syncedLyrics) {
          const synced = parseLrc(record.syncedLyrics);
          if (synced.length > 0) {
            for (const ck of cacheKeys) memoryLyricsCache.set(ck, synced);
            saveToStoredLyricsMap(cacheKeys, synced);
            void saveCachedLyrics(trackId || textCacheKey, cacheKeys, synced);
            return synced;
          }
        }
        if (record.plainLyrics && plainFallback.length === 0) {
          plainFallback = parsePlainLyrics(record.plainLyrics);
        }
      }
    } catch {
      if (masterController.signal.aborted) return [];
      // 404 or non-abort failure — continue to /api/search within remaining budget
    }

    if (masterController.signal.aborted) return [];

    // 4. Search fallback on LRCLIB picking first record with syncedLyrics (or plainLyrics)
    const searchQuery = `${strippedTitle} ${primaryArtist}`.trim();
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;

    try {
      const searchRes = await fetch(searchUrl, { signal: masterController.signal });
      if (searchRes.ok) {
        const list = (await searchRes.json()) as LrcLibRecord[];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item.syncedLyrics?.trim()) {
              const synced = parseLrc(item.syncedLyrics);
              if (synced.length > 0) {
                for (const ck of cacheKeys) memoryLyricsCache.set(ck, synced);
                saveToStoredLyricsMap(cacheKeys, synced);
                void saveCachedLyrics(trackId || textCacheKey, cacheKeys, synced);
                return synced;
              }
            }
          }
          if (plainFallback.length === 0) {
            const withPlain = list.find((item) => Boolean(item.plainLyrics?.trim()));
            if (withPlain?.plainLyrics) {
              plainFallback = parsePlainLyrics(withPlain.plainLyrics);
            }
          }
        }
      }
    } catch {
      if (masterController.signal.aborted) return [];
    }

    if (plainFallback.length > 0) {
      for (const ck of cacheKeys) memoryLyricsCache.set(ck, plainFallback);
      saveToStoredLyricsMap(cacheKeys, plainFallback);
      void saveCachedLyrics(trackId || textCacheKey, cacheKeys, plainFallback);
      return plainFallback;
    }
  } catch {
    return [];
  } finally {
    window.clearTimeout(deadlineTimer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  for (const ck of cacheKeys) memoryLyricsCache.set(ck, []);
  return [];
}
