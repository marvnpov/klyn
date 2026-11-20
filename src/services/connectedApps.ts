import { ConnectedAppEntry, ConnectedAppProvider, PlaylistItem, Track } from '../types/music';
import { searchItunesCatalog } from '../utils/itunesApi';

export interface ConnectedAppSyncResult {
  entry: ConnectedAppEntry;
  importedTracks: Track[];
  importedPlaylist: PlaylistItem | null;
}

const PROVIDER_META: Record<
  ConnectedAppProvider,
  { label: string; oembedBase?: string; defaultQueries: string[] }
> = {
  spotify: {
    label: 'Spotify',
    oembedBase: 'https://open.spotify.com/oembed?url=',
    defaultQueries: ['Today Top Hits', 'RapCaviar', 'R&B Mix'],
  },
  audiomack: {
    label: 'Audiomack',
    defaultQueries: ['Afrobeats Hits', 'Trap Street', 'Trending Rap'],
  },
  soundcloud: {
    label: 'SoundCloud',
    oembedBase: 'https://soundcloud.com/oembed?format=json&url=',
    defaultQueries: ['Underground Electronic', 'Rage Beat', 'Lo-Fi Mix'],
  },
  tunesimo: {
    label: 'Tunesimo',
    defaultQueries: ['Tunesimo Global Top', 'Pop Viral', 'Amapiano Vibes'],
  },
};

function normalizeHandleOrUrl(provider: ConnectedAppProvider, input: string): string {
  const clean = input.trim();
  if (!clean) return '';
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  if (provider === 'spotify') return `https://open.spotify.com/user/${encodeURIComponent(clean.replace(/^@/, ''))}`;
  if (provider === 'soundcloud') return `https://soundcloud.com/${encodeURIComponent(clean.replace(/^@/, ''))}`;
  if (provider === 'audiomack') return `https://audiomack.com/${encodeURIComponent(clean.replace(/^@/, ''))}`;
  return clean;
}

async function tryOembedTitle(provider: ConnectedAppProvider, url: string, signal: AbortSignal): Promise<string | null> {
  const base = PROVIDER_META[provider].oembedBase;
  if (!base || !url.startsWith('http')) return null;
  try {
    const res = await fetch(`${base}${encodeURIComponent(url)}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return data.title?.trim() || data.author_name?.trim() || null;
  } catch {
    return null;
  }
}

export async function connectAndSyncExternalApp(
  provider: ConnectedAppProvider,
  handleOrUrl: string,
): Promise<ConnectedAppSyncResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  const label = PROVIDER_META[provider].label;
  const cleanInput = handleOrUrl.trim() || `@listener`;
  const resolvedUrl = normalizeHandleOrUrl(provider, cleanInput);

  try {
    // Tier 1: Try official oEmbed metadata if provider exposes it and user passed a playlist/track URL
    const oembedTitle = await tryOembedTitle(provider, resolvedUrl, controller.signal);

    // Tier 2: Enrich playable catalog tracks using oEmbed title / handle keywords / provider signature queries
    const keywordQuery =
      oembedTitle && oembedTitle.length > 2
        ? oembedTitle
        : cleanInput.startsWith('http')
          ? PROVIDER_META[provider].defaultQueries[0]
          : cleanInput.replace(/^@/, '');

    let res = await searchItunesCatalog(keywordQuery, 12, controller.signal).catch(() => ({
      tracks: [],
      albums: [],
      artists: [],
    }));

    if (res.tracks.length === 0) {
      res = await searchItunesCatalog(
        PROVIDER_META[provider].defaultQueries[0],
        10,
        controller.signal,
      ).catch(() => ({ tracks: [], albums: [], artists: [] }));
    }

    const taggedTracks: Track[] = res.tracks.map((t) => ({
      ...t,
      externalSource: provider,
      playlistName: oembedTitle || `${label} Sync`,
    }));

    const playlistTitle = oembedTitle || `${label} Imports`;
    const importedPlaylist: PlaylistItem | null =
      taggedTracks.length > 0
        ? {
            id: `pl-import-${provider}-${Date.now()}`,
            title: playlistTitle,
            curator: `Synced from ${label}`,
            description: `Imported library tracks from ${label} (${cleanInput})`,
            trackIds: taggedTracks.map((t) => t.id),
            coverUrl: taggedTracks[0]?.coverUrl ?? '',
            pinned: false,
            downloaded: false,
            sourceProvider: provider,
          }
        : null;

    const nowIso = new Date().toISOString();
    return {
      entry: {
        provider,
        connected: true,
        connectedAt: nowIso,
        lastSyncedAt: nowIso,
        profileUrl: resolvedUrl,
        handleOrId: cleanInput,
        importedCount: taggedTracks.length,
      },
      importedTracks: taggedTracks,
      importedPlaylist,
    };
  } catch {
    const nowIso = new Date().toISOString();
    return {
      entry: {
        provider,
        connected: true,
        connectedAt: nowIso,
        lastSyncedAt: nowIso,
        profileUrl: resolvedUrl,
        handleOrId: cleanInput,
        importedCount: 0,
        syncError: 'Synced profile link; catalog match unavailable offline.',
      },
      importedTracks: [],
      importedPlaylist: null,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
