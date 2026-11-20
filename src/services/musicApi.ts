import { Track, TrackCategory } from '../types/music';
import {
  AlbumChartEntry,
  fetchHomeCatalogFromItunes,
  ItunesSearchResult,
  searchDeezerCatalogJsonp,
  searchItunesArtists,
  searchItunesCatalog,
} from '../utils/itunesApi';
import {
  getSpotifyArtistsByIds,
  getSpotifyBrowseCategories,
  getSpotifyCategoryPlaylists,
  searchSpotifyArtists,
  SpotifyArtistProfile,
  SpotifyCategory,
  SpotifyCategoryPlaylist,
} from './spotifyApi';

interface YouTubeSnippetThumb {
  url?: string;
  width?: number;
  height?: number;
}

interface YouTubeDataSearchResponse {
  nextPageToken?: string;
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        maxres?: YouTubeSnippetThumb;
        standard?: YouTubeSnippetThumb;
        high?: YouTubeSnippetThumb;
        medium?: YouTubeSnippetThumb;
        default?: YouTubeSnippetThumb;
      };
    };
  }>;
  error?: {
    code?: number;
    message?: string;
  };
}

interface PipedSearchItem {
  url?: string;
  id?: string;
  type?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
}

interface InvidiousSearchItem {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ quality?: string; url?: string; width?: number }>;
}

export interface YouTubeSearchPage {
  tracks: Track[];
  nextPageToken: string | null;
  source: 'youtube-data-v3' | 'public-fallback';
}

export interface UnifiedMusicSearchResult extends ItunesSearchResult {
  nextPageToken: string | null;
  spotifyArtists: SpotifyArtistProfile[];
}

export interface EnrichedHomeCatalogResult extends ItunesSearchResult {
  spotifyCategories: SpotifyCategory[];
  spotifyPlaylists: SpotifyCategoryPlaylist[];
  spotifyArtists: SpotifyArtistProfile[];
}

const CENSORED_FILTER_REGEX =
  /\b(clean version|clean edit|radio edit|censored|edited version)\b|\[(clean|edited)\]|\((clean|edited)\)/i;

const PIPED_SEARCH_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
];

const INVIDIOUS_SEARCH_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://inv.thepixora.com',
];

let ytQuotaBlockedUntil = 0;

export function getConfiguredYouTubeApiKey(): string | null {
  const raw = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'MY_YOUTUBE_DATA_API_V3_KEY') return null;
  return trimmed;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseYouTubeTitleAndArtist(rawTitle: string, channelTitle?: string): {
  title: string;
  artist: string;
} {
  const cleanTitle = decodeHtmlEntities(rawTitle)
    .replace(/\s*[\[(](official\s*(music\s*)?(video|audio|visualizer|lyric\s*video)|lyrics|hd|4k)[\])]/gi, '')
    .trim();
  const cleanChannel = decodeHtmlEntities(channelTitle || 'YouTube')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  const separators = [' - ', ' — ', ' – ', ' | '];
  for (const sep of separators) {
    const idx = cleanTitle.indexOf(sep);
    if (idx > 0 && idx < cleanTitle.length - sep.length) {
      const candidateArtist = cleanTitle.slice(0, idx).trim();
      const candidateTrack = cleanTitle.slice(idx + sep.length).trim();
      if (candidateArtist.length >= 2 && candidateTrack.length >= 1) {
        return { artist: candidateArtist, title: candidateTrack };
      }
    }
  }

  return {
    title: cleanTitle || rawTitle,
    artist: cleanChannel || 'YouTube',
  };
}

function extractIdFromPipedUrl(url?: string): string | null {
  if (!url) return null;
  const vMatch = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(url);
  if (vMatch) return vMatch[1];
  const shortMatch = /\/([a-zA-Z0-9_-]{11})$/.exec(url.trim());
  if (shortMatch) return shortMatch[1];
  return null;
}

function pickHighResYouTubeThumb(
  videoId: string,
  thumbnails?: {
    maxres?: YouTubeSnippetThumb;
    standard?: YouTubeSnippetThumb;
    high?: YouTubeSnippetThumb;
    medium?: YouTubeSnippetThumb;
    default?: YouTubeSnippetThumb;
  },
): string {
  const url =
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url.replace(/^http:\/\//i, 'https://');
}

function buildYouTubeTrack(params: {
  videoId: string;
  rawTitle: string;
  channelTitle?: string;
  thumbnailUrl: string;
  duration?: number;
  year?: number;
  popularity?: number;
  genre?: string;
}): Track {
  const { title, artist } = parseYouTubeTitleAndArtist(params.rawTitle, params.channelTitle);
  const category: TrackCategory = 'Music';
  return {
    id: `yt-${params.videoId}`,
    youtubeId: params.videoId,
    title,
    artist,
    album: 'YouTube Music',
    duration: params.duration && params.duration >= 30 ? Math.round(params.duration) : 210,
    primaryColor: '#B93848',
    secondaryColor: '#1E1B2E',
    genre: params.genre || 'Music',
    category,
    quality: 'Lossless',
    coverUrl: params.thumbnailUrl,
    fallbackGradient: 'linear-gradient(135deg, #27272a 0%, #09090b 70%, #3f3f46 100%)',
    playlistName: 'YouTube Discovery',
    year: params.year || new Date().getFullYear(),
    plays: 0,
    popularity: params.popularity ?? 75,
    explicit: !CENSORED_FILTER_REGEX.test(params.rawTitle),
    downloaded: false,
    isExternal: true,
    externalSource: 'youtube',
    lyrics: [],
  };
}

function normalizedTrackIdentity(track: Track): string {
  const normArtist = track.artist
    .toLowerCase()
    .replace(/\b(feat\.?|ft\.?|with)\b.*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const normTitle = track.title
    .toLowerCase()
    .replace(/\s*[\[(][^)\]]*[\])]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${normArtist}::${normTitle}`;
}

export function mergeAndDeduplicateTracks(groups: Track[][]): Track[] {
  const byVideoId = new Map<string, Track>();
  const byIdentity = new Map<string, Track>();
  const ordered: Track[] = [];

  for (const list of groups) {
    for (const track of list) {
      if (!track || !track.title || !track.artist) continue;
      if (CENSORED_FILTER_REGEX.test(`${track.title} ${track.album}`)) continue;

      if (track.youtubeId && byVideoId.has(track.youtubeId)) {
        continue;
      }

      const identityKey = normalizedTrackIdentity(track);
      const existing = byIdentity.get(identityKey);
      if (existing) {
        // Enrich existing record with youtubeId, previewUrl, or spotifyUrl without creating duplicates
        if (!existing.youtubeId && track.youtubeId) {
          existing.youtubeId = track.youtubeId;
          byVideoId.set(track.youtubeId, existing);
        }
        if (!existing.previewUrl && track.previewUrl) {
          existing.previewUrl = track.previewUrl;
        }
        if (!existing.spotifyUrl && track.spotifyUrl) {
          existing.spotifyUrl = track.spotifyUrl;
          existing.spotifyId = track.spotifyId;
          existing.spotifyArtistId = track.spotifyArtistId;
        }
        continue;
      }

      const cloned = { ...track };
      byIdentity.set(identityKey, cloned);
      if (cloned.youtubeId) {
        byVideoId.set(cloned.youtubeId, cloned);
      }
      ordered.push(cloned);
    }
  }

  return ordered;
}

async function searchYouTubeDataApiV3(
  query: string,
  pageToken?: string | null,
  signal?: AbortSignal,
): Promise<YouTubeSearchPage | null> {
  const apiKey = getConfiguredYouTubeApiKey();
  if (!apiKey || Date.now() < ytQuotaBlockedUntil) {
    return null;
  }

  const controller = new AbortController();
  const timer =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 4500) : null;
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=25` +
      `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}${tokenParam}`;
    const res = await fetch(url, { signal: controller.signal });

    if (res.status === 403 || res.status === 429) {
      ytQuotaBlockedUntil = Date.now() + 15 * 60_000;
      return null;
    }
    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as YouTubeDataSearchResponse;
    if (data.error) {
      if (data.error.code === 403 || data.error.code === 429) {
        ytQuotaBlockedUntil = Date.now() + 15 * 60_000;
      }
      return null;
    }

    const tracks: Track[] = [];
    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item, idx) => {
      const videoId = item.id?.videoId;
      const rawTitle = item.snippet?.title;
      if (!videoId || !rawTitle || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;
      if (CENSORED_FILTER_REGEX.test(rawTitle)) return;

      const year = item.snippet?.publishedAt
        ? new Date(item.snippet.publishedAt).getFullYear() || new Date().getFullYear()
        : new Date().getFullYear();

      tracks.push(
        buildYouTubeTrack({
          videoId,
          rawTitle,
          channelTitle: item.snippet?.channelTitle,
          thumbnailUrl: pickHighResYouTubeThumb(videoId, item.snippet?.thumbnails),
          year,
          popularity: Math.max(40, 96 - idx * 2),
        }),
      );
    });

    return {
      tracks,
      nextPageToken: data.nextPageToken ?? null,
      source: 'youtube-data-v3',
    };
  } catch {
    return null;
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    signal?.removeEventListener('abort', onParentAbort);
  }
}

async function searchPipedVideos(
  base: string,
  query: string,
  filter: 'music_songs' | 'videos',
  signal?: AbortSignal,
): Promise<Track[]> {
  const controller = new AbortController();
  const timer =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 3800) : null;
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const res = await fetch(
      `${base}/search?q=${encodeURIComponent(query)}&filter=${filter}`,
      { mode: 'cors', signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Piped ${res.status}`);
    const json = (await res.json()) as { items?: PipedSearchItem[] };
    const results: Track[] = [];

    (json.items ?? []).forEach((item, idx) => {
      if (item.type && item.type !== 'stream') return;
      const rawTitle = item.title ?? '';
      if (!rawTitle || CENSORED_FILTER_REGEX.test(rawTitle)) return;
      const videoId = item.id || extractIdFromPipedUrl(item.url);
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;

      const thumb =
        item.thumbnail?.replace(/^http:\/\//i, 'https://') ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      results.push(
        buildYouTubeTrack({
          videoId,
          rawTitle,
          channelTitle: item.uploaderName,
          thumbnailUrl: thumb,
          duration: item.duration,
          popularity: Math.max(35, 92 - idx * 2),
        }),
      );
    });

    if (results.length === 0) throw new Error('Empty Piped search');
    return results;
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    signal?.removeEventListener('abort', onParentAbort);
  }
}

async function searchInvidiousVideos(
  base: string,
  query: string,
  signal?: AbortSignal,
): Promise<Track[]> {
  const controller = new AbortController();
  const timer =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 3800) : null;
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const res = await fetch(
      `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
      { mode: 'cors', signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Invidious ${res.status}`);
    const json = (await res.json()) as InvidiousSearchItem[];
    const results: Track[] = [];

    (json ?? []).forEach((item, idx) => {
      const videoId = item.videoId;
      const rawTitle = item.title ?? '';
      if (!videoId || !rawTitle || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;
      if (CENSORED_FILTER_REGEX.test(rawTitle)) return;

      const bestThumb =
        item.videoThumbnails?.find((t) => t.quality === 'maxres' || t.quality === 'sddefault')?.url ||
        item.videoThumbnails?.[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      results.push(
        buildYouTubeTrack({
          videoId,
          rawTitle,
          channelTitle: item.author,
          thumbnailUrl: bestThumb.replace(/^http:\/\//i, 'https://'),
          duration: item.lengthSeconds,
          popularity: Math.max(35, 90 - idx * 2),
        }),
      );
    });

    if (results.length === 0) throw new Error('Empty Invidious search');
    return results;
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    signal?.removeEventListener('abort', onParentAbort);
  }
}

async function searchPublicYouTubeFallback(
  query: string,
  signal?: AbortSignal,
): Promise<Track[]> {
  try {
    return await Promise.any([
      ...PIPED_SEARCH_INSTANCES.map((inst) => searchPipedVideos(inst, query, 'music_songs', signal)),
      ...INVIDIOUS_SEARCH_INSTANCES.map((inst) => searchInvidiousVideos(inst, query, signal)),
    ]);
  } catch {
    try {
      return await Promise.any(
        PIPED_SEARCH_INSTANCES.map((inst) => searchPipedVideos(inst, query, 'videos', signal)),
      );
    } catch {
      return [];
    }
  }
}

export async function searchYouTubeTracks(
  query: string,
  pageToken?: string | null,
  signal?: AbortSignal,
): Promise<YouTubeSearchPage> {
  const clean = query.trim();
  if (!clean) {
    return { tracks: [], nextPageToken: null, source: 'public-fallback' };
  }

  const v3Page = await searchYouTubeDataApiV3(clean, pageToken, signal);
  if (v3Page && v3Page.tracks.length > 0) {
    return v3Page;
  }

  if (pageToken) {
    return { tracks: [], nextPageToken: null, source: 'public-fallback' };
  }

  const fallbackTracks = await searchPublicYouTubeFallback(clean, signal);
  return {
    tracks: fallbackTracks,
    nextPageToken: null,
    source: 'public-fallback',
  };
}

/**
 * Resolves embeddable full-length YouTube candidate videoIds for playback inside PlayerEngine/AudioEngine.
 */
export async function resolveYouTubeCandidatesForTrack(track: Track): Promise<string[]> {
  const query = `${track.title} ${track.artist} official audio`.trim();
  const candidates: string[] = [];

  const pushId = (id?: string | null) => {
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id) && !candidates.includes(id)) {
      candidates.push(id);
    }
  };

  pushId(track.youtubeId);
  if (candidates.length > 0) return candidates;

  const v3 = await searchYouTubeDataApiV3(query);
  if (v3 && v3.tracks.length > 0) {
    v3.tracks.slice(0, 4).forEach((t) => pushId(t.youtubeId));
  }

  if (candidates.length === 0) {
    const publicResults = await searchPublicYouTubeFallback(query);
    publicResults.slice(0, 4).forEach((t) => pushId(t.youtubeId));
  }

  return candidates.slice(0, 3);
}

/**
 * Unified multi-source catalog search:
 * Runs YouTube Data API v3 (or Piped/Invidious fallback), iTunes Search, Deezer JSONP, and Spotify Artists in parallel,
 * deduplicating by videoId and track identity cleanly.
 */
export async function searchMusicCatalog(
  query: string,
  options: { limit?: number; pageToken?: string | null; signal?: AbortSignal } = {},
): Promise<UnifiedMusicSearchResult> {
  const clean = query.trim();
  const limit = options.limit ?? 18;
  const pageToken = options.pageToken ?? null;
  const signal = options.signal;

  if (!clean) {
    return { tracks: [], albums: [], artists: [], nextPageToken: null, spotifyArtists: [] };
  }

  // If requesting next YouTube page via pagination token, fetch only the next YouTube page cleanly
  if (pageToken) {
    const ytNext = await searchYouTubeTracks(clean, pageToken, signal);
    return {
      tracks: ytNext.tracks,
      albums: [],
      artists: [],
      nextPageToken: ytNext.nextPageToken,
      spotifyArtists: [],
    };
  }

  const [ytPage, itunesRes, itunesArtists, dzRes, spArtists] = await Promise.all([
    searchYouTubeTracks(clean, null, signal).catch(
      (): YouTubeSearchPage => ({ tracks: [], nextPageToken: null, source: 'public-fallback' }),
    ),
    searchItunesCatalog(clean, limit, signal).catch(
      (): ItunesSearchResult => ({ tracks: [], albums: [], artists: [] }),
    ),
    searchItunesArtists(clean, 8, signal).catch(() => []),
    searchDeezerCatalogJsonp(clean, 10).catch(
      (): ItunesSearchResult => ({ tracks: [], albums: [], artists: [] }),
    ),
    searchSpotifyArtists(clean, 20, signal).catch(() => []),
  ]);

  // Prioritize structured iTunes/Deezer metadata for clean track titles + Spotify/YouTube enrichment
  const mergedTracks = mergeAndDeduplicateTracks([
    itunesRes.tracks,
    dzRes.tracks,
    ytPage.tracks,
  ]);

  const artistMap = new Map<
    string,
    {
      artistId?: number;
      spotifyId?: string;
      spotifyUrl?: string;
      genres?: string[];
      followersTotal?: number;
      popularity?: number;
      name: string;
      genre: string;
      coverUrl: string;
    }
  >();

  for (const sp of spArtists) {
    const key = sp.name.toLowerCase();
    if (!artistMap.has(key)) {
      artistMap.set(key, {
        spotifyId: sp.id,
        spotifyUrl: sp.spotifyUrl,
        genres: sp.genres,
        followersTotal: sp.followersTotal,
        popularity: sp.popularity,
        name: sp.name,
        genre: sp.genres[0] || 'Music',
        coverUrl: sp.coverUrl,
      });
    }
  }

  for (const a of [...itunesRes.artists, ...dzRes.artists]) {
    const key = a.name.toLowerCase();
    if (!artistMap.has(key)) {
      artistMap.set(key, a);
    } else if (!artistMap.get(key)!.coverUrl && a.coverUrl) {
      artistMap.get(key)!.coverUrl = a.coverUrl;
    }
  }

  for (const a of itunesArtists) {
    const key = a.name.toLowerCase();
    const existing = artistMap.get(key);
    if (existing) {
      if (!existing.artistId && a.artistId) existing.artistId = a.artistId;
    } else {
      const matchCover =
        mergedTracks.find((t) => t.artist.toLowerCase() === key)?.coverUrl ?? '';
      artistMap.set(key, {
        artistId: a.artistId,
        name: a.name,
        genre: a.genre,
        coverUrl: matchCover,
      });
    }
  }

  const albumMap = new Map<string, AlbumChartEntry>();
  for (const alb of [...itunesRes.albums, ...dzRes.albums]) {
    const key = `${alb.artistName.toLowerCase()}::${alb.title.toLowerCase()}`;
    if (!albumMap.has(key)) albumMap.set(key, alb);
  }

  return {
    tracks: mergedTracks,
    albums: Array.from(albumMap.values()),
    artists: Array.from(artistMap.values()),
    nextPageToken: ytPage.nextPageToken,
    spotifyArtists: spArtists,
  };
}

/**
 * Fetches Home catalog enriched with Spotify browse categories, category playlists, and artist metadata
 * whenever a Spotify OAuth token is available via /api/spotify/token, automatically falling back to
 * Apple RSS + iTunes + Deezer JSONP + YouTube otherwise.
 */
export async function fetchEnrichedHomeCatalog(
  favoriteGenres: string[],
  signal?: AbortSignal,
): Promise<EnrichedHomeCatalogResult> {
  const [baseCatalog, spotifyCategories] = await Promise.all([
    fetchHomeCatalogFromItunes(favoriteGenres, signal),
    getSpotifyBrowseCategories(30, signal).catch(() => []),
  ]);

  let spotifyPlaylists: SpotifyCategoryPlaylist[] = [];
  let spotifyArtists: SpotifyArtistProfile[] = [];

  if (spotifyCategories.length > 0) {
    const targetCategories = spotifyCategories.slice(0, 3);
    const playlistSettled = await Promise.allSettled(
      targetCategories.map((cat) => getSpotifyCategoryPlaylists(cat.id, 10, cat.name, signal)),
    );
    const seenPlaylistIds = new Set<string>();
    for (const res of playlistSettled) {
      if (res.status !== 'fulfilled') continue;
      for (const pl of res.value) {
        if (!seenPlaylistIds.has(pl.id)) {
          seenPlaylistIds.add(pl.id);
          spotifyPlaylists.push(pl);
        }
      }
    }
  }

  const topArtistNames = baseCatalog.artists.slice(0, 5).map((a) => a.name);
  if (topArtistNames.length > 0) {
    const artistQueries = await Promise.allSettled(
      topArtistNames.map((name) => searchSpotifyArtists(name, 1, signal)),
    );
    const candidateIds: string[] = [];
    for (const res of artistQueries) {
      if (res.status === 'fulfilled' && res.value[0]?.id) {
        candidateIds.push(res.value[0].id);
      }
    }
    if (candidateIds.length > 0) {
      spotifyArtists = await getSpotifyArtistsByIds(candidateIds.slice(0, 50), signal).catch(
        () => [],
      );
    }
  }

  return {
    ...baseCatalog,
    spotifyCategories,
    spotifyPlaylists,
    spotifyArtists,
  };
}
