import { ArtistAlbum, Track, TrackCategory } from '../types/music';

interface ItunesRawItem {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  collectionType?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  trackCount?: number;
}

const ACCENT_PALETTE = [
  {
    primary: '#C27838',
    secondary: '#2E1E12',
    gradient: 'linear-gradient(135deg, #2b1d12 0%, #09090b 65%, #7c4a1d 100%)',
  },
  {
    primary: '#B93848',
    secondary: '#25173A',
    gradient: 'linear-gradient(135deg, #631d2c 0%, #1c1433 60%, #09090b 100%)',
  },
  {
    primary: '#2B78B8',
    secondary: '#162533',
    gradient: 'linear-gradient(135deg, #13395e 0%, #09090b 65%, #2c6e91 100%)',
  },
  {
    primary: '#4D9473',
    secondary: '#1E2A30',
    gradient: 'linear-gradient(135deg, #1b4332 0%, #09090b 60%, #2b3f47 100%)',
  },
  {
    primary: '#8F2D43',
    secondary: '#260D14',
    gradient: 'linear-gradient(135deg, #521725 0%, #16090d 65%, #09090b 100%)',
  },
];

export function upgradeArtworkUrl(url?: string): string {
  if (!url) return '';
  return url
    .replace(/100x100bb/i, '600x600bb')
    .replace(/60x60bb/i, '600x600bb')
    .replace(/^http:\/\//i, 'https://');
}

function inferCategory(genre: string): TrackCategory {
  const g = genre.toLowerCase();
  if (g.includes('electronic') || g.includes('ambient') || g.includes('classical')) return 'Spatial';
  if (g.includes('dance') || g.includes('house') || g.includes('hip-hop') || g.includes('lo-fi'))
    return 'Mixes';
  return 'Music';
}

function pickPalette(seed: number) {
  return ACCENT_PALETTE[Math.abs(seed) % ACCENT_PALETTE.length];
}

export interface ItunesSearchResult {
  tracks: Track[];
  albums: Array<ArtistAlbum & { artistName: string; artistId?: number; genre: string }>;
  artists: Array<{ artistId?: number; name: string; genre: string; coverUrl: string }>;
}

function mapRawItemsToResult(rawItems: ItunesRawItem[]): ItunesSearchResult {
  const tracks: Track[] = [];
  const albumMap = new Map<
    string,
    ArtistAlbum & { artistName: string; artistId?: number; genre: string }
  >();
  const artistMap = new Map<
    string,
    { artistId?: number; name: string; genre: string; coverUrl: string }
  >();

  rawItems.forEach((item, idx) => {
    if (item.wrapperType === 'collection' && item.collectionName && item.artistName) {
      const coverUrl = upgradeArtworkUrl(item.artworkUrl100 || item.artworkUrl60);
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() || 2025 : 2025;
      const key = `${item.artistName}::${item.collectionName}`;
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          id: `itunes-alb-${item.collectionId ?? idx}`,
          collectionId: item.collectionId,
          title: item.collectionName,
          year,
          type:
            (item.trackCount ?? 0) <= 3 || item.collectionName.toLowerCase().includes('single')
              ? 'Single'
              : (item.trackCount ?? 0) <= 6
                ? 'EP'
                : 'Album',
          coverUrl,
          trackIds: [],
          artistName: item.artistName,
          artistId: item.artistId,
          genre: item.primaryGenreName || 'Music',
        });
      }
      return;
    }

    if (!item.trackName || !item.artistName) return;
    const id = `itunes-${item.trackId ?? `${idx}-${Date.now()}`}`;
    const genre = item.primaryGenreName || 'Pop';
    const palette = pickPalette(item.trackId ?? idx);
    const coverUrl = upgradeArtworkUrl(item.artworkUrl100 || item.artworkUrl60);
    const durationSec = Math.max(30, Math.round((item.trackTimeMillis ?? 195000) / 1000));
    const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() || 2025 : 2025;
    const category = inferCategory(genre);

    const track: Track = {
      id,
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName || `${item.trackName} — Single`,
      duration: durationSec,
      primaryColor: palette.primary,
      secondaryColor: palette.secondary,
      genre,
      category,
      quality: category === 'Spatial' ? 'Dolby Atmos' : 'Lossless',
      coverUrl,
      fallbackGradient: palette.gradient,
      playlistName: `${genre} Discovery`,
      year,
      plays: 0,
      downloaded: false,
      artistId: item.artistId,
      collectionId: item.collectionId,
      isExternal: true,
      lyrics: [],
    };

    tracks.push(track);

    const albumKey = `${item.artistName}::${track.album}`;
    const existingAlbum = albumMap.get(albumKey);
    if (existingAlbum) {
      if (!existingAlbum.trackIds.includes(track.id)) {
        existingAlbum.trackIds.push(track.id);
      }
    } else {
      albumMap.set(albumKey, {
        id: `itunes-alb-${item.collectionId ?? idx}`,
        collectionId: item.collectionId,
        title: track.album,
        year,
        type: track.album.toLowerCase().includes('single') ? 'Single' : 'Album',
        coverUrl,
        trackIds: [track.id],
        artistName: item.artistName,
        artistId: item.artistId,
        genre,
      });
    }

    const artKey = item.artistName.toLowerCase();
    if (!artistMap.has(artKey)) {
      artistMap.set(artKey, {
        artistId: item.artistId,
        name: item.artistName,
        genre,
        coverUrl,
      });
    }
  });

  const uniqueTracks = Array.from(new Map(tracks.map((t) => [t.id, t])).values());

  return {
    tracks: uniqueTracks,
    albums: Array.from(albumMap.values()),
    artists: Array.from(artistMap.values()),
  };
}

export async function searchItunesCatalog(
  term: string,
  limit = 16,
  signal?: AbortSignal,
): Promise<ItunesSearchResult> {
  const cleanTerm = term.trim();
  if (!cleanTerm) {
    return { tracks: [], albums: [], artists: [] };
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    cleanTerm,
  )}&media=music&entity=song&limit=${limit}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`iTunes Search returned ${response.status}`);
  }

  const data = (await response.json()) as { results?: ItunesRawItem[] };
  return mapRawItemsToResult(data.results ?? []);
}

export interface RealArtistCatalogEntry {
  id: string;
  artistId?: number;
  name: string;
  genre: string;
  coverUrl: string;
  tracks: Track[];
}

const GENRE_REAL_ARTISTS: Record<string, string[]> = {
  'r&b': ['Frank Ocean', 'SZA', 'Daniel Caesar', 'The Weeknd'],
  soul: ['Frank Ocean', 'SZA', 'Leon Bridges', 'Cleo Sol'],
  electronic: ['Fred again..', 'Kaytranada', 'Disclosure', 'Jamie xx'],
  ambient: ['Bonobo', 'Tycho', 'Nils Frahm', 'Brian Eno'],
  house: ['Fred again..', 'Disclosure', 'Peggy Gou', 'Kaytranada'],
  indie: ['Tame Impala', 'Phoebe Bridgers', 'Clairo', 'Mac DeMarco'],
  pop: ['Billie Eilish', 'The Weeknd', 'Dua Lipa', 'SZA'],
  'hip-hop': ['Kendrick Lamar', 'Tyler, The Creator', 'Travis Scott', 'J. Cole'],
  rock: ['Arctic Monkeys', 'Radiohead', 'Tame Impala', 'Paramore'],
  jazz: ['Kamasi Washington', 'Robert Glasper', 'BADBADNOTGOOD', 'Samara Joy'],
  classical: ['Ludovico Einaudi', 'Max Richter', 'Olafur Arnalds'],
  'lo-fi': ['Nujabes', 'J Dilla', 'Tom Misch', 'Men I Trust'],
};

const DEFAULT_REAL_ARTISTS = [
  'Frank Ocean',
  'SZA',
  'The Weeknd',
  'Fred again..',
  'Tame Impala',
  'Kendrick Lamar',
  'Billie Eilish',
  'Kaytranada',
  'Daniel Caesar',
  'Arctic Monkeys',
];

const realArtistsCache = new Map<string, RealArtistCatalogEntry[]>();
const homeCatalogCache = new Map<string, ItunesSearchResult>();

export async function fetchRealArtistsCatalog(
  favoriteGenres: string[],
  priorityArtistNames: string[] = [],
  signal?: AbortSignal,
): Promise<RealArtistCatalogEntry[]> {
  const orderedNames: string[] = [];
  const seen = new Set<string>();

  const pushArtist = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    orderedNames.push(clean);
  };

  priorityArtistNames.forEach(pushArtist);

  favoriteGenres.forEach((genre) => {
    const g = genre.toLowerCase();
    Object.entries(GENRE_REAL_ARTISTS).forEach(([bucket, artists]) => {
      if (g.includes(bucket) || bucket.includes(g)) {
        artists.forEach(pushArtist);
      }
    });
  });

  DEFAULT_REAL_ARTISTS.forEach(pushArtist);
  const targets = orderedNames.slice(0, 10);
  const cacheKey = targets.map((n) => n.toLowerCase()).join('|');

  const cached = realArtistsCache.get(cacheKey);
  if (cached) return cached;

  const settled = await Promise.allSettled(
    targets.map(async (artistName): Promise<RealArtistCatalogEntry | null> => {
      const res = await searchItunesCatalog(artistName, 5, signal);
      const exactMatches = res.tracks.filter(
        (t) => t.artist.toLowerCase() === artistName.toLowerCase(),
      );
      const partialMatches = res.tracks.filter((t) =>
        t.artist.toLowerCase().includes(artistName.toLowerCase()),
      );
      const artistTracks =
        exactMatches.length > 0
          ? exactMatches
          : partialMatches.length > 0
            ? partialMatches
            : res.tracks;
      const lead = artistTracks[0];
      if (!lead) return null;

      const slug = lead.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return {
        id: `real-art-${lead.artistId ?? slug}-${slug}`,
        artistId: lead.artistId,
        name: lead.artist,
        genre: lead.genre,
        coverUrl: lead.coverUrl,
        tracks: artistTracks,
      };
    }),
  );

  const entries: RealArtistCatalogEntry[] = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      const nameKey = item.value.name.toLowerCase();
      if (!seenNames.has(nameKey) && !seenIds.has(item.value.id)) {
        seenNames.add(nameKey);
        seenIds.add(item.value.id);
        entries.push(item.value);
      }
    }
  }

  if (entries.length > 0) {
    realArtistsCache.set(cacheKey, entries);
  }
  return entries;
}

export async function fetchHomeCatalogFromItunes(
  favoriteGenres: string[],
  signal?: AbortSignal,
): Promise<ItunesSearchResult> {
  const cleanGenres = favoriteGenres.map((g) => g.trim()).filter(Boolean);
  const cacheKey = cleanGenres.map((g) => g.toLowerCase()).sort().join('|') || 'default';
  const cached = homeCatalogCache.get(cacheKey);
  if (cached) return cached;

  const queries = [
    ...(cleanGenres.slice(0, 2).map((g) => `${g} hits`)),
    'top songs 2026',
    'electronic ambient spatial',
    'alt r&b soul',
  ].slice(0, 4);

  const settled = await Promise.allSettled(
    queries.map((q) => searchItunesCatalog(q, 10, signal)),
  );

  const trackMap = new Map<string, Track>();
  const albumMap = new Map<
    string,
    ArtistAlbum & { artistName: string; artistId?: number; genre: string }
  >();
  const seenAlbumIds = new Set<string>();
  const artistMap = new Map<
    string,
    { artistId?: number; name: string; genre: string; coverUrl: string }
  >();

  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    for (const t of res.value.tracks) {
      if (!trackMap.has(t.id)) trackMap.set(t.id, t);
    }
    for (const alb of res.value.albums) {
      const key = `${alb.artistName.toLowerCase()}::${alb.title.toLowerCase()}`;
      if (!albumMap.has(key) && !seenAlbumIds.has(alb.id)) {
        seenAlbumIds.add(alb.id);
        albumMap.set(key, alb);
      }
    }
    for (const art of res.value.artists) {
      const key = art.name.toLowerCase();
      if (!artistMap.has(key)) artistMap.set(key, art);
    }
  }

  const combined: ItunesSearchResult = {
    tracks: Array.from(trackMap.values()),
    albums: Array.from(albumMap.values()),
    artists: Array.from(artistMap.values()),
  };

  if (combined.tracks.length > 0) {
    homeCatalogCache.set(cacheKey, combined);
  }
  return combined;
}

export interface ArtistCatalogLookupResult {
  artistId?: number;
  name: string;
  genre: string;
  coverUrl: string;
  tracks: Track[];
  albums: Array<ArtistAlbum & { artistName: string; genre: string }>;
}

const artistLookupCache = new Map<string, ArtistCatalogLookupResult>();

export async function lookupArtistCatalog(
  params: { artistId?: number; artistName: string },
  signal?: AbortSignal,
): Promise<ArtistCatalogLookupResult> {
  const cleanName = params.artistName.trim();
  const cacheKey = `${params.artistId ?? ''}:${cleanName.toLowerCase()}`;
  const cached = artistLookupCache.get(cacheKey);
  if (cached) return cached;

  let resolvedArtistId = params.artistId;
  let resolvedArtistName = cleanName;
  let resolvedGenre = 'Music';

  // Resolve real iTunes artistId if we only have the artist name
  if (!resolvedArtistId && cleanName) {
    try {
      const artistSearchRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          cleanName,
        )}&media=music&entity=musicArtist&limit=3`,
        { signal },
      );
      if (artistSearchRes.ok) {
        const json = (await artistSearchRes.json()) as { results?: ItunesRawItem[] };
        const bestArtist =
          json.results?.find(
            (r) => r.artistName?.toLowerCase() === cleanName.toLowerCase(),
          ) ?? json.results?.[0];
        if (bestArtist?.artistId) {
          resolvedArtistId = bestArtist.artistId;
          resolvedArtistName = bestArtist.artistName || cleanName;
          resolvedGenre = bestArtist.primaryGenreName || 'Music';
        }
      }
    } catch {
      // fallback below
    }
  }

  if (resolvedArtistId) {
    try {
      const [songsRes, albumsRes] = await Promise.all([
        fetch(
          `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&limit=25`,
          { signal },
        ),
        fetch(
          `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=album&limit=15`,
          { signal },
        ),
      ]);

      const songItems = songsRes.ok
        ? ((await songsRes.json()) as { results?: ItunesRawItem[] }).results ?? []
        : [];
      const albumItems = albumsRes.ok
        ? ((await albumsRes.json()) as { results?: ItunesRawItem[] }).results ?? []
        : [];

      const songsParsed = mapRawItemsToResult(songItems);
      const albumsParsed = mapRawItemsToResult(albumItems);

      // Merge album entries + associate tracks matching by collectionId or album title
      const mergedAlbumMap = new Map<
        string,
        ArtistAlbum & { artistName: string; genre: string }
      >();
      for (const alb of albumsParsed.albums) {
        mergedAlbumMap.set(alb.title.toLowerCase(), alb);
      }
      for (const alb of songsParsed.albums) {
        const key = alb.title.toLowerCase();
        const existing = mergedAlbumMap.get(key);
        if (existing) {
          existing.trackIds = Array.from(new Set([...existing.trackIds, ...alb.trackIds]));
          if (!existing.coverUrl) existing.coverUrl = alb.coverUrl;
        } else {
          mergedAlbumMap.set(key, alb);
        }
      }

      const lead = songsParsed.tracks[0];
      const result: ArtistCatalogLookupResult = {
        artistId: resolvedArtistId,
        name: lead?.artist || resolvedArtistName,
        genre: lead?.genre || resolvedGenre,
        coverUrl: lead?.coverUrl || albumsParsed.albums[0]?.coverUrl || '',
        tracks: songsParsed.tracks,
        albums: Array.from(mergedAlbumMap.values()),
      };

      if (result.tracks.length > 0 || result.albums.length > 0) {
        artistLookupCache.set(cacheKey, result);
        return result;
      }
    } catch {
      // fall through to song search fallback
    }
  }

  // Fallback to searchItunesCatalog if lookup fails
  const searchFallback = await searchItunesCatalog(cleanName, 20, signal);
  const exactTracks = searchFallback.tracks.filter(
    (t) =>
      t.artist.toLowerCase() === cleanName.toLowerCase() ||
      t.artist.toLowerCase().includes(cleanName.toLowerCase()),
  );
  const finalTracks = exactTracks.length > 0 ? exactTracks : searchFallback.tracks;
  const fallbackResult: ArtistCatalogLookupResult = {
    artistId: finalTracks[0]?.artistId,
    name: finalTracks[0]?.artist || cleanName,
    genre: finalTracks[0]?.genre || 'Music',
    coverUrl: finalTracks[0]?.coverUrl || '',
    tracks: finalTracks,
    albums: searchFallback.albums,
  };
  if (fallbackResult.tracks.length > 0) {
    artistLookupCache.set(cacheKey, fallbackResult);
  }
  return fallbackResult;
}
