import { Track } from '../types/music';
import {
  searchMusicCatalog,
  UnifiedMusicSearchResult,
} from './musicApi';

function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  const curr = new Array<number>(t.length + 1).fill(0);

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) {
      prev[j] = curr[j];
    }
  }
  return prev[t.length];
}

function findClosestDynamicTerm(query: string, localTracks: Track[]): string | null {
  const clean = query.trim();
  if (clean.length < 3) return null;
  const lower = clean.toLowerCase();

  const candidatePool = new Set<string>();
  for (const t of localTracks) {
    if (t.artist) candidatePool.add(t.artist);
    if (t.title) candidatePool.add(t.title);
  }

  let best: string | null = null;
  let bestScore = Infinity;

  for (const candidate of candidatePool) {
    const cLower = candidate.toLowerCase();
    if (cLower === lower) return null;
    if (cLower.includes(lower) && clean.length >= 4) {
      return candidate;
    }
    const dist = levenshtein(lower, cLower);
    const maxAllowed = Math.max(2, Math.floor(cLower.length * 0.35));
    if (dist <= maxAllowed && dist < bestScore) {
      bestScore = dist;
      best = candidate;
    }
  }

  return best;
}

function fetchYouTubeSuggestion(query: string, timeoutMs = 1400): Promise<string | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    const cbName = `__klynYtSuggest_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
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
      resolve(null);
    }, timeoutMs);

    win[cbName] = (payload: unknown) => {
      cleanup();
      try {
        const rows =
          Array.isArray(payload) && Array.isArray(payload[1])
            ? (payload[1] as unknown[])
            : [];
        const first = rows.find((item) => typeof item === 'string') as string | undefined;
        resolve(first ? first.trim() : null);
      } catch {
        resolve(null);
      }
    };

    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(
      query,
    )}&callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

export interface SmartSearchResponse extends UnifiedMusicSearchResult {
  correctedQuery: string | null;
}

export async function runSmartCatalogSearch(
  query: string,
  localTracks: Track[],
  limit = 18,
  signal?: AbortSignal,
  pageToken?: string | null,
): Promise<SmartSearchResponse> {
  const clean = query.trim();
  if (!clean) {
    return {
      tracks: [],
      albums: [],
      artists: [],
      nextPageToken: null,
      spotifyArtists: [],
      correctedQuery: null,
    };
  }

  const primary = await searchMusicCatalog(clean, { limit, pageToken, signal });

  if (pageToken || primary.tracks.length >= 4) {
    return {
      ...primary,
      correctedQuery: null,
    };
  }

  // Typo-tolerance using dynamically indexed tracks + YouTube Suggest JSONP
  const localSuggestion = findClosestDynamicTerm(clean, localTracks);
  const ytSuggestion = localSuggestion ? null : await fetchYouTubeSuggestion(clean);
  const corrected = localSuggestion || ytSuggestion;

  if (corrected && corrected.toLowerCase() !== clean.toLowerCase()) {
    const correctedRes = await searchMusicCatalog(corrected, { limit, signal });
    if (correctedRes.tracks.length > 0) {
      return {
        ...correctedRes,
        correctedQuery: corrected,
      };
    }
  }

  return {
    ...primary,
    correctedQuery: null,
  };
}
