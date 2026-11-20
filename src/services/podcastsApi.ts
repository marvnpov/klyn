import { PodcastShow, ShowEpisode, ShowKind, Track } from '../types/music';
import { upgradeArtworkUrl } from '../utils/itunesApi';

interface ItunesPodcastRaw {
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  primaryGenreName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  feedUrl?: string;
  description?: string;
  episodeUrl?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
}

const showsCache = new Map<string, PodcastShow[]>();
const episodesCache = new Map<string, ShowEpisode[]>();

const CURATED_SHOW_QUERIES: Array<{ term: string; kind: ShowKind }> = [
  { term: 'music producer interview podcast', kind: 'podcast' },
  { term: 'hip hop culture podcast', kind: 'podcast' },
  { term: 'creative sound design audiobook', kind: 'audiobook' },
  { term: 'music biography audiobook', kind: 'audiobook' },
];

export async function fetchPodcastsAndAudiobooks(
  signal?: AbortSignal,
): Promise<PodcastShow[]> {
  const cached = showsCache.get('default');
  if (cached && cached.length > 0) return cached;

  const settled = await Promise.allSettled(
    CURATED_SHOW_QUERIES.map(async ({ term, kind }) => {
      const media = kind === 'audiobook' ? 'audiobook' : 'podcast';
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term,
      )}&media=${media}&limit=6`;
      const res = await fetch(url, { signal });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: ItunesPodcastRaw[] };
      return (data.results ?? []).map((raw, idx): PodcastShow | null => {
        const id = raw.collectionId ? `${kind}-${raw.collectionId}` : `${kind}-${idx}-${Date.now()}`;
        const title = (raw.collectionName || raw.trackName || '').trim();
        const author = (raw.artistName || 'KLYN Creator').trim();
        const coverUrl = upgradeArtworkUrl(raw.artworkUrl600 || raw.artworkUrl100, '600x600bb');
        if (!title || !coverUrl) return null;

        const episodeUrl = (raw.episodeUrl || raw.previewUrl || '').replace(/^http:\/\//i, 'https://');
        const initialEpisodes: ShowEpisode[] = episodeUrl
          ? [
              {
                id: `ep-${raw.collectionId ?? idx}-1`,
                showId: id,
                title: kind === 'audiobook' ? `${title} — Chapter 1` : `${title} — Latest Episode`,
                author,
                description: raw.description || `${genreFallback(kind, raw.primaryGenreName)} series`,
                duration: Math.max(120, Math.round((raw.trackTimeMillis ?? 1800000) / 1000)),
                releaseDate: raw.releaseDate,
                audioUrl: episodeUrl,
                coverUrl,
                episodeNumber: 1,
              },
            ]
          : [];

        return {
          id,
          title,
          author,
          kind,
          genre: genreFallback(kind, raw.primaryGenreName),
          description: raw.description || `${author} · ${genreFallback(kind, raw.primaryGenreName)}`,
          coverUrl,
          feedUrl: raw.feedUrl,
          episodes: initialEpisodes,
        };
      });
    }),
  );

  const map = new Map<string, PodcastShow>();
  for (const row of settled) {
    if (row.status !== 'fulfilled') continue;
    for (const show of row.value) {
      if (show && !map.has(show.id)) {
        map.set(show.id, show);
      }
    }
  }

  const list = Array.from(map.values());
  if (list.length > 0) {
    showsCache.set('default', list);
  }
  return list;
}

function genreFallback(kind: ShowKind, raw?: string): string {
  if (raw && raw.trim()) return raw.trim();
  return kind === 'audiobook' ? 'Audiobook' : 'Podcast';
}

export async function searchShowsCatalog(
  query: string,
  signal?: AbortSignal,
): Promise<PodcastShow[]> {
  const clean = query.trim();
  if (!clean) return [];
  const cacheKey = `q:${clean.toLowerCase()}`;
  const cached = showsCache.get(cacheKey);
  if (cached) return cached;

  const [podRes, bookRes] = await Promise.allSettled([
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&media=podcast&limit=6`, { signal }),
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&media=audiobook&limit=4`, { signal }),
  ]);

  const map = new Map<string, PodcastShow>();

  const ingest = async (res: PromiseSettledResult<Response>, kind: ShowKind) => {
    if (res.status !== 'fulfilled' || !res.value.ok) return;
    const json = (await res.value.json()) as { results?: ItunesPodcastRaw[] };
    for (const raw of json.results ?? []) {
      const cid = raw.collectionId;
      const title = (raw.collectionName || raw.trackName || '').trim();
      const author = (raw.artistName || '').trim();
      const coverUrl = upgradeArtworkUrl(raw.artworkUrl600 || raw.artworkUrl100, '600x600bb');
      if (!cid || !title || !coverUrl) continue;
      const id = `${kind}-${cid}`;
      if (map.has(id)) continue;
      map.set(id, {
        id,
        title,
        author: author || 'Creator',
        kind,
        genre: genreFallback(kind, raw.primaryGenreName),
        description: raw.description || `${author || title}`,
        coverUrl,
        feedUrl: raw.feedUrl,
        episodes: raw.previewUrl
          ? [
              {
                id: `ep-${cid}-1`,
                showId: id,
                title: kind === 'audiobook' ? `${title} · Sample Chapter` : `${title} · Highlight`,
                author: author || title,
                duration: Math.max(90, Math.round((raw.trackTimeMillis ?? 900000) / 1000)),
                audioUrl: raw.previewUrl.replace(/^http:\/\//i, 'https://'),
                coverUrl,
                episodeNumber: 1,
              },
            ]
          : [],
      });
    }
  };

  await Promise.all([ingest(podRes, 'podcast'), ingest(bookRes, 'audiobook')]);
  const list = Array.from(map.values());
  if (list.length > 0) showsCache.set(cacheKey, list);
  return list;
}

export async function fetchShowEpisodes(
  show: PodcastShow,
  signal?: AbortSignal,
): Promise<ShowEpisode[]> {
  const cached = episodesCache.get(show.id);
  if (cached && cached.length > 0) return cached;

  const numericId = show.id.replace(/^(podcast|audiobook)-/, '');
  if (!/^\d+$/.test(numericId)) return show.episodes;

  try {
    const entity = show.kind === 'audiobook' ? 'audiobook' : 'podcastEpisode';
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${numericId}&entity=${entity}&limit=16`,
      { signal },
    );
    if (!res.ok) return show.episodes;
    const data = (await res.json()) as { results?: ItunesPodcastRaw[] };
    const episodes: ShowEpisode[] = [];

    (data.results ?? []).forEach((item, idx) => {
      if (idx === 0 && !item.episodeUrl && !item.trackName) return;
      const title = (item.trackName || '').trim();
      const audioUrl = (item.episodeUrl || item.previewUrl || '').replace(/^http:\/\//i, 'https://');
      if (!title) return;
      episodes.push({
        id: `ep-${numericId}-${item.trackId ?? idx}`,
        showId: show.id,
        title,
        author: item.artistName || show.author,
        description: item.description,
        duration: Math.max(90, Math.round((item.trackTimeMillis ?? 1500000) / 1000)),
        releaseDate: item.releaseDate,
        audioUrl,
        coverUrl: upgradeArtworkUrl(item.artworkUrl600 || item.artworkUrl100, '600x600bb') || show.coverUrl,
        episodeNumber: episodes.length + 1,
      });
    });

    if (episodes.length > 0) {
      episodesCache.set(show.id, episodes);
      return episodes;
    }
  } catch {
    // Fall back to preloaded show episodes
  }

  return show.episodes;
}

export function episodeToTrack(show: PodcastShow, episode: ShowEpisode): Track {
  return {
    id: episode.id,
    title: episode.title,
    artist: episode.author || show.author,
    album: show.title,
    duration: episode.duration || 1800,
    primaryColor: '#2B78B8',
    secondaryColor: '#0f172a',
    genre: show.genre || (show.kind === 'audiobook' ? 'Audiobook' : 'Podcast'),
    category: 'Music',
    quality: 'Lossless',
    coverUrl: episode.coverUrl || show.coverUrl,
    fallbackGradient: 'linear-gradient(135deg, #13395e 0%, #09090b 75%)',
    playlistName: show.title,
    year: episode.releaseDate ? new Date(episode.releaseDate).getFullYear() || 2025 : 2025,
    plays: 0,
    downloaded: false,
    isExternal: true,
    isPodcastEpisode: show.kind === 'podcast',
    isAudiobookChapter: show.kind === 'audiobook',
    showId: show.id,
    audioStreamUrl: episode.audioUrl,
    lyrics: [],
  };
}
