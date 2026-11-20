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
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  trackCount?: number;
  trackExplicitness?: 'explicit' | 'cleaned' | 'notExplicit';
  collectionExplicitness?: 'explicit' | 'cleaned' | 'notExplicit';
}

interface DeezerTrackRaw {
  id?: number;
  title?: string;
  duration?: number;
  explicit_lyrics?: boolean;
  preview?: string;
  artist?: {
    id?: number;
    name?: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
  };
  album?: {
    id?: number;
    title?: string;
    cover_xl?: string;
    cover_big?: string;
    cover_medium?: string;
  };
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

const CLEAN_EDIT_REGEX =
  /\b(clean version|clean edit|radio edit|censored|edited version)\b|\[(clean|edited)\]|\((clean|edited)\)/i;

export function isCleanCensoredVariant(item: {
  trackName?: string;
  collectionName?: string;
  trackExplicitness?: string;
}): boolean {
  if (item.trackExplicitness === 'cleaned') return true;
  const combined = `${item.trackName ?? ''} ${item.collectionName ?? ''}`;
  return CLEAN_EDIT_REGEX.test(combined);
}

export function upgradeArtworkUrl(url?: string, targetSize = '600x600bb'): string {
  if (!url) return '';
  return url
    .replace(/100x100bb/i, targetSize)
    .replace(/60x60bb/i, targetSize)
    .replace(/30x30bb/i, targetSize)
    .replace(/^http:\/\//i, 'https://');
}

function inferCategory(genre: string): TrackCategory {
  const g = genre.toLowerCase();
  if (
    g.includes('dance') ||
    g.includes('house') ||
    g.includes('electronic') ||
    g.includes('hip-hop') ||
    g.includes('lo-fi') ||
    g.includes('trap')
  ) {
    return 'Mixes';
  }
  return 'Music';
}

function pickPalette(seed: number) {
  return ACCENT_PALETTE[Math.abs(seed) % ACCENT_PALETTE.length];
}

export type AlbumChartEntry = ArtistAlbum & {
  artistName: string;
  artistId?: number;
  genre: string;
};

export interface ItunesSearchResult {
  tracks: Track[];
  albums: AlbumChartEntry[];
  artists: Array<{ artistId?: number; name: string; genre: string; coverUrl: string }>;
  chartTracks?: Track[];
  chartAlbums?: AlbumChartEntry[];
}

function mapRawItemsToResult(rawItems: ItunesRawItem[]): ItunesSearchResult {
  const tracks: Track[] = [];
  const albumMap = new Map<string, AlbumChartEntry>();
  const artistMap = new Map<
    string,
    { artistId?: number; name: string; genre: string; coverUrl: string }
  >();

  const filteredRaw = rawItems.filter((item) => !isCleanCensoredVariant(item));
  const songByTitleKey = new Map<string, ItunesRawItem>();

  for (const item of filteredRaw) {
    if (item.wrapperType === 'collection' || item.wrapperType === 'artist') continue;
    if (!item.trackName || !item.artistName) continue;
    const normKey = `${item.artistName.toLowerCase()}::${item.trackName
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, '')
      .trim()}`;
    const existing = songByTitleKey.get(normKey);
    if (
      !existing ||
      (item.trackExplicitness === 'explicit' && existing.trackExplicitness !== 'explicit')
    ) {
      songByTitleKey.set(normKey, item);
    }
  }

  const dedupedRaw = [
    ...filteredRaw.filter((i) => i.wrapperType === 'collection' || i.wrapperType === 'artist'),
    ...Array.from(songByTitleKey.values()),
  ];

  dedupedRaw.forEach((item, idx) => {
    if (item.wrapperType === 'artist' && item.artistName) {
      const artKey = item.artistName.toLowerCase();
      if (!artistMap.has(artKey)) {
        artistMap.set(artKey, {
          artistId: item.artistId,
          name: item.artistName,
          genre: item.primaryGenreName || 'Music',
          coverUrl: '',
        });
      }
      return;
    }

    if (item.wrapperType === 'collection' && item.collectionName && item.artistName) {
      const coverUrl = upgradeArtworkUrl(item.artworkUrl100 || item.artworkUrl60, '600x600bb');
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() || 2025 : 2025;
      const key = `${item.artistName.toLowerCase()}::${item.collectionName.toLowerCase()}`;
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
    const coverUrl = upgradeArtworkUrl(item.artworkUrl100 || item.artworkUrl60, '600x600bb');
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
      quality: category === 'Mixes' ? 'Hi-Res Lossless' : 'Lossless',
      coverUrl,
      fallbackGradient: palette.gradient,
      playlistName: `${genre} Discovery`,
      year,
      plays: 0,
      popularity: Math.max(10, 100 - idx * 3),
      explicit: item.trackExplicitness === 'explicit',
      previewUrl: item.previewUrl?.replace(/^http:\/\//i, 'https://'),
      downloaded: false,
      artistId: item.artistId,
      collectionId: item.collectionId,
      isExternal: true,
      externalSource: 'itunes',
      lyrics: [],
    };

    tracks.push(track);

    const albumKey = `${item.artistName.toLowerCase()}::${track.album.toLowerCase()}`;
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
    const existingArtist = artistMap.get(artKey);
    if (!existingArtist) {
      artistMap.set(artKey, {
        artistId: item.artistId,
        name: item.artistName,
        genre,
        coverUrl,
      });
    } else if (!existingArtist.coverUrl && coverUrl) {
      existingArtist.coverUrl = coverUrl;
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

  const [songsRes, albumsRes] = await Promise.allSettled([
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        cleanTerm,
      )}&media=music&entity=song&explicit=Yes&limit=${limit}`,
      { signal },
    ),
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        cleanTerm,
      )}&media=music&entity=album&explicit=Yes&limit=${Math.min(10, limit)}`,
      { signal },
    ),
  ]);

  const rawItems: ItunesRawItem[] = [];
  if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
    const data = (await songsRes.value.json()) as { results?: ItunesRawItem[] };
    rawItems.push(...(data.results ?? []));
  }
  if (albumsRes.status === 'fulfilled' && albumsRes.value.ok) {
    const data = (await albumsRes.value.json()) as { results?: ItunesRawItem[] };
    rawItems.push(...(data.results ?? []));
  }

  if (
    rawItems.length === 0 &&
    songsRes.status === 'rejected' &&
    albumsRes.status === 'rejected'
  ) {
    throw songsRes.reason instanceof Error
      ? songsRes.reason
      : new Error('Unable to reach iTunes catalog');
  }

  return mapRawItemsToResult(rawItems);
}

export async function searchItunesArtists(
  term: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<Array<{ artistId?: number; name: string; genre: string }>> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        cleanTerm,
      )}&media=music&entity=musicArtist&limit=${limit}`,
      { signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItunesRawItem[] };
    const seen = new Set<string>();
    const out: Array<{ artistId?: number; name: string; genre: string }> = [];
    for (const item of data.results ?? []) {
      const name = item.artistName?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        artistId: item.artistId,
        name,
        genre: item.primaryGenreName || 'Music',
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function searchDeezerCatalogJsonp(
  term: string,
  limit = 12,
  timeoutMs = 3200,
): Promise<ItunesSearchResult> {
  const cleanTerm = term.trim();
  if (!cleanTerm || typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve({ tracks: [], albums: [], artists: [] });
  }

  return new Promise<ItunesSearchResult>((resolve) => {
    const cbName = `__klynDzSearch_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
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
      resolve({ tracks: [], albums: [], artists: [] });
    }, timeoutMs);

    win[cbName] = (payload: unknown) => {
      cleanup();
      try {
        const rows = (payload as { data?: DeezerTrackRaw[] })?.data;
        if (!Array.isArray(rows)) {
          resolve({ tracks: [], albums: [], artists: [] });
          return;
        }
        const tracks: Track[] = [];
        const albumMap = new Map<string, AlbumChartEntry>();
        const artistMap = new Map<
          string,
          { artistId?: number; name: string; genre: string; coverUrl: string }
        >();

        rows.forEach((raw, idx) => {
          const title = raw.title?.trim();
          const artist = raw.artist?.name?.trim();
          if (!title || !artist) return;
          if (isCleanCensoredVariant({ trackName: title, collectionName: raw.album?.title })) {
            return;
          }
          const coverUrl = (
            raw.album?.cover_xl ||
            raw.album?.cover_big ||
            raw.album?.cover_medium ||
            raw.artist?.picture_xl ||
            raw.artist?.picture_big ||
            ''
          ).replace(/^http:\/\//i, 'https://');
          const palette = pickPalette(raw.id ?? idx);
          const track: Track = {
            id: `dz-${raw.id ?? `${idx}-${Date.now()}`}`,
            title,
            artist,
            album: raw.album?.title?.trim() || `${title} — Single`,
            duration: Math.max(30, raw.duration ?? 190),
            primaryColor: palette.primary,
            secondaryColor: palette.secondary,
            genre: 'Music',
            category: 'Music',
            quality: 'Lossless',
            coverUrl,
            fallbackGradient: palette.gradient,
            playlistName: 'Deezer Discovery',
            year: 2025,
            plays: 0,
            popularity: Math.max(20, 96 - idx * 3),
            explicit: Boolean(raw.explicit_lyrics),
            previewUrl: raw.preview?.replace(/^http:\/\//i, 'https://'),
            downloaded: false,
            artistId: raw.artist?.id,
            collectionId: raw.album?.id,
            isExternal: true,
            externalSource: 'itunes',
            lyrics: [],
          };
          tracks.push(track);

          const albKey = `${artist.toLowerCase()}::${track.album.toLowerCase()}`;
          if (!albumMap.has(albKey) && coverUrl) {
            albumMap.set(albKey, {
              id: `dz-alb-${raw.album?.id ?? idx}`,
              collectionId: raw.album?.id,
              title: track.album,
              year: 2025,
              type: track.album.toLowerCase().includes('single') ? 'Single' : 'Album',
              coverUrl,
              trackIds: [track.id],
              artistName: artist,
              artistId: raw.artist?.id,
              genre: 'Music',
            });
          }

          const artKey = artist.toLowerCase();
          if (!artistMap.has(artKey)) {
            const artCover = (
              raw.artist?.picture_xl ||
              raw.artist?.picture_big ||
              raw.artist?.picture_medium ||
              coverUrl
            ).replace(/^http:\/\//i, 'https://');
            artistMap.set(artKey, {
              artistId: raw.artist?.id,
              name: artist,
              genre: 'Music',
              coverUrl: artCover,
            });
          }
        });

        resolve({
          tracks,
          albums: Array.from(albumMap.values()),
          artists: Array.from(artistMap.values()),
        });
      } catch {
        resolve({ tracks: [], albums: [], artists: [] });
      }
    };

    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(
      cleanTerm,
    )}&limit=${limit}&output=jsonp&callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      resolve({ tracks: [], albums: [], artists: [] });
    };
    document.head.appendChild(script);
  });
}

export interface RealArtistCatalogEntry {
  id: string;
  artistId?: number;
  name: string;
  genre: string;
  coverUrl: string;
  tracks: Track[];
}

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

  // Dynamically discover active artists from live Apple Charts RSS & genre queries
  const cleanGenres = favoriteGenres.map((g) => g.trim()).filter(Boolean).slice(0, 3);
  const [chartTracks, ...genreArtistSearches] = await Promise.all([
    fetchAppleTopChartsRss(signal),
    ...cleanGenres.map((genre) => searchItunesCatalog(genre, 6, signal).catch(() => null)),
  ]);

  for (const res of genreArtistSearches) {
    if (!res) continue;
    res.artists.forEach((a) => pushArtist(a.name));
  }
  chartTracks.forEach((t) => pushArtist(t.artist));

  const targets = orderedNames.slice(0, 12);
  if (targets.length === 0) return [];

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

interface AppleRssSongEntry {
  id?: string;
  name?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  contentAdvisoryRating?: string;
  genres?: Array<{ name?: string }>;
}

async function fetchAppleTopChartsRss(signal?: AbortSignal): Promise<Track[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const res = await fetch(
      'https://rss.marketingtools.apple.com/api/v2/us/music/most-played/25/songs.json',
      { signal: controller.signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      feed?: { results?: AppleRssSongEntry[] };
    };
    const results = data.feed?.results ?? [];
    const tracks: Track[] = [];

    results.forEach((item, idx) => {
      if (!item.name || !item.artistName) return;
      if (isCleanCensoredVariant({ trackName: item.name })) return;
      const genre = item.genres?.[0]?.name || 'Pop';
      const palette = pickPalette(Number(item.id) || idx);
      const coverUrl = upgradeArtworkUrl(item.artworkUrl100, '1000x1000bb');
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() || 2026 : 2026;
      const category = inferCategory(genre);

      tracks.push({
        id: `itunes-${item.id ?? `rss-${idx}`}`,
        title: item.name,
        artist: item.artistName,
        album: `${item.name} — Single`,
        duration: 205,
        primaryColor: palette.primary,
        secondaryColor: palette.secondary,
        genre,
        category,
        quality: category === 'Mixes' ? 'Hi-Res Lossless' : 'Lossless',
        coverUrl,
        fallbackGradient: palette.gradient,
        playlistName: 'Top Charts',
        year,
        plays: 0,
        popularity: Math.max(20, 100 - idx * 2),
        explicit: item.contentAdvisoryRating === 'Explicit',
        downloaded: false,
        isExternal: true,
        externalSource: 'itunes',
        lyrics: [],
      });
    });

    return tracks;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export async function fetchAppleTopAlbumsRss(signal?: AbortSignal): Promise<AlbumChartEntry[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const res = await fetch(
      'https://rss.marketingtools.apple.com/api/v2/us/music/most-played/20/albums.json',
      { signal: controller.signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      feed?: { results?: AppleRssSongEntry[] };
    };
    const results = data.feed?.results ?? [];
    const albums: AlbumChartEntry[] = [];
    const seenKeys = new Set<string>();

    results.forEach((item, idx) => {
      if (!item.name || !item.artistName) return;
      if (isCleanCensoredVariant({ collectionName: item.name })) return;
      const key = `${item.artistName.toLowerCase()}::${item.name.toLowerCase()}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const numericId = Number(item.id);
      const collectionId = Number.isFinite(numericId) && numericId > 0 ? numericId : undefined;
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() || 2026 : 2026;

      albums.push({
        id: `rss-alb-${item.id ?? idx}`,
        collectionId,
        title: item.name,
        year,
        type: item.name.toLowerCase().includes('single')
          ? 'Single'
          : item.name.toLowerCase().includes('ep')
            ? 'EP'
            : 'Album',
        coverUrl: upgradeArtworkUrl(item.artworkUrl100, '1000x1000bb'),
        trackIds: [],
        artistName: item.artistName,
        genre: item.genres?.[0]?.name || 'Music',
      });
    });

    return albums;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

const albumLookupCache = new Map<number, Track[]>();

export async function lookupAlbumTracks(
  collectionId: number,
  signal?: AbortSignal,
): Promise<Track[]> {
  if (!Number.isFinite(collectionId) || collectionId <= 0) return [];
  const cached = albumLookupCache.get(collectionId);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4500);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&explicit=Yes&limit=30`,
      { signal: controller.signal },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesRawItem[] };
    const parsed = mapRawItemsToResult(json.results ?? []);
    if (parsed.tracks.length > 0) {
      albumLookupCache.set(collectionId, parsed.tracks);
    }
    return parsed.tracks;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export async function fetchHomeCatalogFromItunes(
  favoriteGenres: string[],
  signal?: AbortSignal,
): Promise<ItunesSearchResult> {
  const cleanGenres = favoriteGenres.map((g) => g.trim()).filter(Boolean);
  const cacheKey = cleanGenres.map((g) => g.toLowerCase()).sort().join('|') || 'default';
  const cached = homeCatalogCache.get(cacheKey);
  if (cached) return cached;

  const queries =
    cleanGenres.length > 0
      ? cleanGenres.slice(0, 4).map((g) => `${g} hits`)
      : ['Top Hits', 'New Music', 'Hip-Hop R&B', 'Pop'];

  const [chartTracks, chartAlbums, settled, deezerSupplement] = await Promise.all([
    fetchAppleTopChartsRss(signal),
    fetchAppleTopAlbumsRss(signal),
    Promise.allSettled(queries.map((q) => searchItunesCatalog(q, 14, signal))),
    searchDeezerCatalogJsonp(queries[0] || 'top hits', 10),
  ]);

  const trackMap = new Map<string, Track>();
  const albumMap = new Map<string, AlbumChartEntry>();
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

  for (const art of deezerSupplement.artists) {
    const key = art.name.toLowerCase();
    if (!artistMap.has(key)) artistMap.set(key, art);
  }

  for (const chartAlb of chartAlbums) {
    const key = `${chartAlb.artistName.toLowerCase()}::${chartAlb.title.toLowerCase()}`;
    if (!albumMap.has(key) && !seenAlbumIds.has(chartAlb.id)) {
      seenAlbumIds.add(chartAlb.id);
      albumMap.set(key, chartAlb);
    }
  }

  for (const chartTrack of chartTracks) {
    if (!trackMap.has(chartTrack.id)) {
      trackMap.set(chartTrack.id, chartTrack);
    }
  }

  const combined: ItunesSearchResult = {
    tracks: Array.from(trackMap.values()),
    albums: Array.from(albumMap.values()),
    artists: Array.from(artistMap.values()),
    chartTracks,
    chartAlbums,
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
          `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&explicit=Yes&limit=30`,
          { signal },
        ),
        fetch(
          `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=album&explicit=Yes&limit=18`,
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
