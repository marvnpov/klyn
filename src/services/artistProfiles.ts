import { searchItunesCatalog } from '../utils/itunesApi';

const ARTIST_PHOTO_CACHE_KEY = 'klyn_artist_photos_v2';
const memoryPhotoCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

function loadStoredPhotos(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ARTIST_PHOTO_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveStoredPhoto(key: string, url: string): void {
  if (typeof window === 'undefined' || !url) return;
  try {
    const map = loadStoredPhotos();
    map[key] = url;
    const entries = Object.entries(map).slice(-160);
    window.localStorage.setItem(ARTIST_PHOTO_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore storage quota errors
  }
}

function fetchDeezerArtistJsonp(artistName: string, timeoutMs = 3500): Promise<string> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve('');
  }

  return new Promise<string>((resolve) => {
    const cbName = `__klynDzCb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const win = window as unknown as Record<string, unknown>;
    let settled = false;
    const script = document.createElement('script');

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        delete win[cbName];
      } catch {
        win[cbName] = undefined;
      }
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve('');
    }, timeoutMs);

    win[cbName] = (payload: unknown) => {
      cleanup();
      try {
        const data = (payload as { data?: Array<{ name?: string; picture_xl?: string; picture_big?: string; picture_medium?: string }> })?.data;
        if (!Array.isArray(data) || data.length === 0) {
          resolve('');
          return;
        }
        const lower = artistName.toLowerCase();
        const exact = data.find((d) => (d.name ?? '').toLowerCase() === lower) ?? data[0];
        const photo = exact?.picture_xl || exact?.picture_big || exact?.picture_medium || '';
        resolve(photo.replace(/^http:\/\//i, 'https://'));
      } catch {
        resolve('');
      }
    };

    script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(
      artistName,
    )}&limit=3&output=jsonp&callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      resolve('');
    };
    document.head.appendChild(script);
  });
}

export function getCachedArtistPhoto(artistName: string): string | null {
  const key = artistName.trim().toLowerCase();
  if (!key) return null;
  const mem = memoryPhotoCache.get(key);
  if (mem) return mem;
  const stored = loadStoredPhotos()[key];
  if (stored) {
    memoryPhotoCache.set(key, stored);
    return stored;
  }
  return null;
}

export async function fetchRealArtistPhoto(
  artistName: string,
  fallbackCoverUrl = '',
): Promise<string> {
  const clean = artistName.trim();
  if (!clean) return fallbackCoverUrl;
  const key = clean.toLowerCase();

  const cached = getCachedArtistPhoto(clean);
  if (cached) return cached;

  const existingInflight = inflightRequests.get(key);
  if (existingInflight) return existingInflight;

  const task = (async () => {
    try {
      const deezerUrl = await fetchDeezerArtistJsonp(clean);
      if (deezerUrl) {
        memoryPhotoCache.set(key, deezerUrl);
        saveStoredPhoto(key, deezerUrl);
        return deezerUrl;
      }

      if (fallbackCoverUrl) {
        return fallbackCoverUrl;
      }

      const itunes = await searchItunesCatalog(clean, 3);
      const cover = itunes.tracks[0]?.coverUrl || '';
      if (cover) {
        memoryPhotoCache.set(key, cover);
        saveStoredPhoto(key, cover);
      }
      return cover;
    } catch {
      return fallbackCoverUrl;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, task);
  return task;
}
