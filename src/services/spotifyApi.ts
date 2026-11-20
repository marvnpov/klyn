import { Track, TrackCategory } from '../types/music';
import { AlbumChartEntry } from '../utils/itunesApi';

export interface SpotifyImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  images: SpotifyImage[];
  coverUrl: string;
  genres: string[];
  popularity: number;
  followersTotal: number;
  spotifyUrl: string;
  externalSource: 'spotify';
}

export interface SpotifyCategory {
  id: string;
  name: string;
  icons: SpotifyImage[];
  coverUrl: string;
  spotifyUrl: string;
  externalSource: 'spotify';
}

export interface SpotifyCategoryPlaylist {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  coverUrl: string;
  images: SpotifyImage[];
  totalTracks: number;
  spotifyUrl: string;
  categoryId: string;
  categoryName: string;
  externalSource: 'spotify';
}

interface SpotifyTokenResponse {
  available?: boolean;
  accessToken?: string | null;
  expiresAt?: number;
}

interface SpotifyRawArtist {
  id?: string;
  name?: string;
  images?: SpotifyImage[];
  genres?: string[];
  popularity?: number;
  followers?: { total?: number };
  external_urls?: { spotify?: string };
}

interface SpotifyRawAlbum {
  id?: string;
  name?: string;
  album_type?: string;
  release_date?: string;
  images?: SpotifyImage[];
  artists?: Array<{ id?: string; name?: string }>;
  external_urls?: { spotify?: string };
}

interface SpotifyRawTrack {
  id?: string;
  name?: string;
  duration_ms?: number;
  popularity?: number;
  explicit?: boolean;
  preview_url?: string | null;
  artists?: Array<{ id?: string; name?: string; external_urls?: { spotify?: string } }>;
  album?: SpotifyRawAlbum;
  external_urls?: { spotify?: string };
}

interface SpotifyRawCategory {
  id?: string;
  name?: string;
  icons?: SpotifyImage[];
}

interface SpotifyRawPlaylist {
  id?: string;
  name?: string;
  description?: string;
  images?: SpotifyImage[];
  owner?: { display_name?: string };
  tracks?: { total?: number };
  external_urls?: { spotify?: string };
}

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const CLEAN_EDIT_REGEX =
  /\b(clean version|clean edit|radio edit|censored|edited version)\b|\[(clean|edited)\]|\((clean|edited)\)/i;

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
let tokenUnavailableUntil = 0;
let inflightTokenPromise: Promise<string | null> | null = null;

const artistSearchCache = new Map<string, SpotifyArtistProfile[]>();
const artistByIdCache = new Map<string, SpotifyArtistProfile>();
const artistTopTracksCache = new Map<string, Track[]>();
const artistAlbumsCache = new Map<string, AlbumChartEntry[]>();
let categoriesCache: SpotifyCategory[] | null = null;
const categoryPlaylistsCache = new Map<string, SpotifyCategoryPlaylist[]>();
const playlistTracksCache = new Map<string, Track[]>();

function getConfiguredSpotifyClientId(): string | null {
  const raw = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'MY_SPOTIFY_CLIENT_ID') return null;
  return trimmed;
}

/**
 * Returns the highest-resolution Spotify image URL unmodified and uncropped.
 */
export function pickHighestResSpotifyImage(images?: SpotifyImage[]): string {
  if (!Array.isArray(images) || images.length === 0) return '';
  const sorted = [...images].sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    return areaB - areaA;
  });
  const url = sorted[0]?.url || images[0]?.url || '';
  return url.replace(/^http:\/\//i, 'https://');
}

export function formatSpotifyFollowers(count?: number): string {
  if (!Number.isFinite(count) || !count || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M followers`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K followers`;
  return `${count} followers`;
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && tokenExpiresAt > now + 30_000) {
    return cachedAccessToken;
  }
  if (tokenUnavailableUntil > now) {
    return null;
  }
  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = (async () => {
    const controller = new AbortController();
    const timer =
      typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 3500) : null;
    try {
      const clientId = getConfiguredSpotifyClientId();
      const res = await fetch('/api/spotify/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientId ? { clientId } : {}),
        signal: controller.signal,
      });
      if (!res.ok) {
        tokenUnavailableUntil = Date.now() + 60_000;
        return null;
      }
      const data = (await res.json()) as SpotifyTokenResponse;
      if (!data.available || !data.accessToken) {
        tokenUnavailableUntil = Date.now() + 60_000;
        return null;
      }
      cachedAccessToken = data.accessToken;
      tokenExpiresAt = data.expiresAt || Date.now() + 50 * 60_000;
      return cachedAccessToken;
    } catch {
      tokenUnavailableUntil = Date.now() + 60_000;
      return null;
    } finally {
      if (timer !== null && typeof window !== 'undefined') {
        window.clearTimeout(timer);
      }
      inflightTokenPromise = null;
    }
  })();

  return inflightTokenPromise;
}

async function spotifyFetchJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  const controller = new AbortController();
  const timer =
    typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 4500) : null;
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      if (res.status === 403) {
        tokenUnavailableUntil = Date.now() + 120_000;
      }
      return null;
    }

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    signal?.removeEventListener('abort', onParentAbort);
  }
}

function mapSpotifyArtist(raw: SpotifyRawArtist): SpotifyArtistProfile | null {
  if (!raw.id || !raw.name) return null;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const profile: SpotifyArtistProfile = {
    id: raw.id,
    name: raw.name,
    images,
    coverUrl: pickHighestResSpotifyImage(images),
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    popularity: Number.isFinite(raw.popularity) ? Number(raw.popularity) : 0,
    followersTotal: Number.isFinite(raw.followers?.total) ? Number(raw.followers?.total) : 0,
    spotifyUrl: raw.external_urls?.spotify || `https://open.spotify.com/artist/${raw.id}`,
    externalSource: 'spotify',
  };
  artistByIdCache.set(raw.id, profile);
  return profile;
}

function inferTrackCategory(genre: string): TrackCategory {
  const g = genre.toLowerCase();
  if (
    g.includes('dance') ||
    g.includes('house') ||
    g.includes('electronic') ||
    g.includes('hip-hop') ||
    g.includes('rap') ||
    g.includes('trap')
  ) {
    return 'Mixes';
  }
  return 'Music';
}

function mapSpotifyTrack(raw: SpotifyRawTrack, fallbackGenre = 'Music'): Track | null {
  if (!raw.id || !raw.name) return null;
  if (CLEAN_EDIT_REGEX.test(raw.name)) return null;

  const primaryArtist = raw.artists?.[0];
  const artistName =
    raw.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown Artist';
  const coverUrl = pickHighestResSpotifyImage(raw.album?.images);
  const year = raw.album?.release_date
    ? new Date(raw.album.release_date).getFullYear() || 2026
    : 2026;
  const category = inferTrackCategory(fallbackGenre);

  return {
    id: `sp-${raw.id}`,
    spotifyId: raw.id,
    spotifyArtistId: primaryArtist?.id,
    spotifyUrl: raw.external_urls?.spotify || `https://open.spotify.com/track/${raw.id}`,
    title: raw.name,
    artist: artistName,
    album: raw.album?.name || `${raw.name} — Single`,
    duration: Math.max(30, Math.round((raw.duration_ms ?? 195_000) / 1000)),
    primaryColor: '#1DB954',
    secondaryColor: '#0E1F14',
    genre: fallbackGenre,
    category,
    quality: 'Lossless',
    coverUrl,
    fallbackGradient: 'linear-gradient(135deg, #163020 0%, #09090b 70%, #1DB95433 100%)',
    playlistName: 'Spotify Discovery',
    year,
    plays: 0,
    popularity: Number.isFinite(raw.popularity) ? Number(raw.popularity) : 70,
    explicit: Boolean(raw.explicit),
    previewUrl: raw.preview_url?.replace(/^http:\/\//i, 'https://'),
    downloaded: false,
    isExternal: true,
    externalSource: 'spotify',
    lyrics: [],
  };
}

function mapSpotifyAlbum(raw: SpotifyRawAlbum, fallbackArtist = 'Artist'): AlbumChartEntry | null {
  if (!raw.id || !raw.name) return null;
  if (CLEAN_EDIT_REGEX.test(raw.name)) return null;
  const year = raw.release_date ? new Date(raw.release_date).getFullYear() || 2026 : 2026;
  const albumType =
    raw.album_type === 'single'
      ? 'Single'
      : raw.name.toLowerCase().includes('ep')
        ? 'EP'
        : 'Album';

  return {
    id: `sp-alb-${raw.id}`,
    spotifyId: raw.id,
    spotifyUrl: raw.external_urls?.spotify || `https://open.spotify.com/album/${raw.id}`,
    title: raw.name,
    year,
    type: albumType,
    coverUrl: pickHighestResSpotifyImage(raw.images),
    trackIds: [],
    artistName: raw.artists?.[0]?.name || fallbackArtist,
    genre: 'Music',
  };
}

export async function searchSpotifyArtists(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<SpotifyArtistProfile[]> {
  const clean = query.trim();
  if (!clean) return [];
  const safeLimit = Math.min(20, Math.max(1, limit));
  const cacheKey = `${clean.toLowerCase()}::${safeLimit}`;
  const cached = artistSearchCache.get(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetchJson<{
    artists?: { items?: SpotifyRawArtist[] };
  }>(`/search?q=${encodeURIComponent(clean)}&type=artist&limit=${safeLimit}`, signal);

  const items = (data?.artists?.items ?? [])
    .map(mapSpotifyArtist)
    .filter((a): a is SpotifyArtistProfile => Boolean(a));

  if (items.length > 0) {
    artistSearchCache.set(cacheKey, items);
  }
  return items;
}

export async function getSpotifyArtistsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<SpotifyArtistProfile[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const cachedResults: SpotifyArtistProfile[] = [];
  const missingIds: string[] = [];

  for (const id of uniqueIds) {
    const cached = artistByIdCache.get(id);
    if (cached) cachedResults.push(cached);
    else missingIds.push(id);
  }

  if (missingIds.length === 0) {
    return cachedResults;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < missingIds.length; i += 50) {
    chunks.push(missingIds.slice(i, i + 50));
  }

  const fetchedResults: SpotifyArtistProfile[] = [];
  for (const chunk of chunks) {
    const data = await spotifyFetchJson<{ artists?: Array<SpotifyRawArtist | null> }>(
      `/artists?ids=${encodeURIComponent(chunk.join(','))}`,
      signal,
    );
    for (const raw of data?.artists ?? []) {
      if (!raw) continue;
      const mapped = mapSpotifyArtist(raw);
      if (mapped) fetchedResults.push(mapped);
    }
  }

  return [...cachedResults, ...fetchedResults];
}

export async function getSpotifyArtistTopTracks(
  artistId: string,
  market = 'US',
  signal?: AbortSignal,
): Promise<Track[]> {
  const cleanId = artistId.trim();
  if (!cleanId) return [];
  const cacheKey = `${cleanId}::${market}`;
  const cached = artistTopTracksCache.get(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetchJson<{ tracks?: SpotifyRawTrack[] }>(
    `/artists/${encodeURIComponent(cleanId)}/top-tracks?market=${encodeURIComponent(market)}`,
    signal,
  );

  const artistGenre = artistByIdCache.get(cleanId)?.genres?.[0] || 'Music';
  const tracks = (data?.tracks ?? [])
    .map((t) => mapSpotifyTrack(t, artistGenre))
    .filter((t): t is Track => Boolean(t));

  if (tracks.length > 0) {
    artistTopTracksCache.set(cacheKey, tracks);
  }
  return tracks;
}

export async function getSpotifyArtistAlbums(
  artistId: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AlbumChartEntry[]> {
  const cleanId = artistId.trim();
  if (!cleanId) return [];
  const cached = artistAlbumsCache.get(cleanId);
  if (cached) return cached;

  const data = await spotifyFetchJson<{ items?: SpotifyRawAlbum[] }>(
    `/artists/${encodeURIComponent(cleanId)}/albums?include_groups=album,single&limit=${Math.min(
      50,
      Math.max(1, limit),
    )}`,
    signal,
  );

  const artistName = artistByIdCache.get(cleanId)?.name || 'Artist';
  const seenTitles = new Set<string>();
  const albums: AlbumChartEntry[] = [];

  for (const raw of data?.items ?? []) {
    const mapped = mapSpotifyAlbum(raw, artistName);
    if (!mapped) continue;
    const key = mapped.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    albums.push(mapped);
  }

  if (albums.length > 0) {
    artistAlbumsCache.set(cleanId, albums);
  }
  return albums;
}

export async function getSpotifyBrowseCategories(
  limit = 30,
  signal?: AbortSignal,
): Promise<SpotifyCategory[]> {
  if (categoriesCache && categoriesCache.length > 0) {
    return categoriesCache.slice(0, limit);
  }

  const safeLimit = Math.min(50, Math.max(1, limit));
  const data = await spotifyFetchJson<{
    categories?: { items?: SpotifyRawCategory[] };
  }>(`/browse/categories?limit=${safeLimit}`, signal);

  const mapped: SpotifyCategory[] = [];
  for (const raw of data?.categories?.items ?? []) {
    if (!raw.id || !raw.name) continue;
    const icons = Array.isArray(raw.icons) ? raw.icons : [];
    const coverUrl = pickHighestResSpotifyImage(icons);
    if (!coverUrl) continue;
    mapped.push({
      id: raw.id,
      name: raw.name,
      icons,
      coverUrl,
      spotifyUrl: `https://open.spotify.com/genre/${encodeURIComponent(raw.id)}`,
      externalSource: 'spotify',
    });
  }

  if (mapped.length > 0) {
    categoriesCache = mapped;
  }
  return mapped;
}

export async function getSpotifyCategoryPlaylists(
  categoryId: string,
  limit = 20,
  categoryName?: string,
  signal?: AbortSignal,
): Promise<SpotifyCategoryPlaylist[]> {
  const cleanId = categoryId.trim();
  if (!cleanId) return [];
  const cached = categoryPlaylistsCache.get(cleanId);
  if (cached) return cached.slice(0, limit);

  const safeLimit = Math.min(50, Math.max(1, limit));
  const data = await spotifyFetchJson<{
    playlists?: { items?: Array<SpotifyRawPlaylist | null> };
  }>(`/browse/categories/${encodeURIComponent(cleanId)}/playlists?limit=${safeLimit}`, signal);

  const playlists: SpotifyCategoryPlaylist[] = [];
  for (const raw of data?.playlists?.items ?? []) {
    if (!raw?.id || !raw.name) continue;
    const images = Array.isArray(raw.images) ? raw.images : [];
    const coverUrl = pickHighestResSpotifyImage(images);
    playlists.push({
      id: raw.id,
      name: raw.name,
      description: raw.description?.replace(/<[^>]+>/g, '') || '',
      ownerName: raw.owner?.display_name || 'Spotify',
      coverUrl,
      images,
      totalTracks: raw.tracks?.total ?? 0,
      spotifyUrl: raw.external_urls?.spotify || `https://open.spotify.com/playlist/${raw.id}`,
      categoryId: cleanId,
      categoryName: categoryName || cleanId,
      externalSource: 'spotify',
    });
  }

  if (playlists.length > 0) {
    categoryPlaylistsCache.set(cleanId, playlists);
  }
  return playlists;
}

export async function getSpotifyPlaylistTracks(
  playlistId: string,
  limit = 25,
  signal?: AbortSignal,
): Promise<Track[]> {
  const cleanId = playlistId.trim();
  if (!cleanId) return [];
  const cached = playlistTracksCache.get(cleanId);
  if (cached) return cached;

  const data = await spotifyFetchJson<{
    items?: Array<{ track?: SpotifyRawTrack | null }>;
  }>(`/playlists/${encodeURIComponent(cleanId)}/tracks?limit=${Math.min(50, limit)}`, signal);

  const tracks: Track[] = [];
  for (const row of data?.items ?? []) {
    if (!row?.track) continue;
    const mapped = mapSpotifyTrack(row.track, 'Music');
    if (mapped) tracks.push(mapped);
  }

  if (tracks.length > 0) {
    playlistTracksCache.set(cleanId, tracks);
  }
  return tracks;
}
