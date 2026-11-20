import { Track } from '../types/music';
import {
  cacheTrackOffline,
  getCachedAudioBlobEntry,
  getCachedTrackEntry,
} from './offlineCache';

export type PlaybackSource = 'offline-blob' | 'youtube' | 'idle';

export interface PlayerEngineCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (message: string, track: Track) => void;
  onStateChange?: (isPlaying: boolean, source: PlaybackSource, track: Track | null) => void;
}

interface YTPlayerVars {
  autoplay?: 0 | 1;
  controls?: 0 | 1;
  disablekb?: 0 | 1;
  enablejsapi?: 0 | 1;
  fs?: 0 | 1;
  iv_load_policy?: 1 | 3;
  modestbranding?: 0 | 1;
  playsinline?: 0 | 1;
  rel?: 0 | 1;
  origin?: string;
}

interface YTPlayerInstance {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volumePercent: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    elementId: string | HTMLElement,
    options: {
      width?: number | string;
      height?: number | string;
      videoId?: string;
      playerVars?: YTPlayerVars;
      events?: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
        onError?: (event: { data: number; target: YTPlayerInstance }) => void;
      };
    },
  ) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeSearchResponse {
  items?: Array<{
    id?: {
      videoId?: string;
    };
  }>;
}

interface PipedSearchItem {
  url?: string;
  id?: string;
  type?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
}

interface InvidiousSearchItem {
  videoId?: string;
  type?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

const YT_VIDEO_CACHE_KEY = 'klyn_yt_vid_cache_v1';
const STREAM_UNAVAILABLE_MESSAGE = 'Stream unavailable for this track — try another';

const PIPED_SEARCH_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
];

const INVIDIOUS_SEARCH_INSTANCES = ['https://inv.thepixora.com'];

function getConfiguredYouTubeApiKey(): string | null {
  const raw = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'MY_YOUTUBE_DATA_API_V3_KEY') return null;
  return trimmed;
}

function extractIdFromPipedUrl(url?: string): string | null {
  if (!url) return null;
  const vMatch = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(url);
  if (vMatch) return vMatch[1];
  const shortMatch = /\/([a-zA-Z0-9_-]{11})$/.exec(url.trim());
  if (shortMatch) return shortMatch[1];
  return null;
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;
      const parts = url.pathname.split('/').filter(Boolean);
      const maybeId = parts[1];
      if (maybeId && /^[a-zA-Z0-9_-]{11}$/.test(maybeId)) return maybeId;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

export async function fetchYouTubeTrackMeta(videoId: string): Promise<Track | null> {
  const cleanId = extractYouTubeVideoId(videoId);
  if (!cleanId) return null;

  let title = `YouTube Track (${cleanId})`;
  let artist = 'YouTube';
  let coverUrl = `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;

  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${cleanId}`,
      )}`,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      if (data.title) {
        const dashSplit = data.title.split(' - ');
        if (dashSplit.length >= 2) {
          artist = dashSplit[0].trim();
          title = dashSplit.slice(1).join(' - ').trim();
        } else {
          title = data.title.trim();
          if (data.author_name) artist = data.author_name.replace(/ - Topic$/i, '').trim();
        }
      } else if (data.author_name) {
        artist = data.author_name.replace(/ - Topic$/i, '').trim();
      }
      if (data.thumbnail_url) {
        coverUrl = data.thumbnail_url;
      }
    }
  } catch {
    // keep default YouTube thumbnail and fallback title
  }

  return {
    id: `yt-${cleanId}`,
    youtubeId: cleanId,
    title,
    artist,
    album: 'YouTube Direct',
    duration: 210,
    primaryColor: '#B93848',
    secondaryColor: '#1E1B2E',
    genre: 'Music',
    category: 'Music',
    quality: 'Lossless',
    coverUrl,
    fallbackGradient: 'linear-gradient(135deg, #27272a 0%, #09090b 70%, #3f3f46 100%)',
    playlistName: 'YouTube Direct',
    year: new Date().getFullYear(),
    plays: 0,
    downloaded: false,
    isExternal: true,
    lyrics: [],
  };
}

export class PlayerEngine {
  private callbacks: PlayerEngineCallbacks = {};
  private currentTrack: Track | null = null;
  private source: PlaybackSource = 'idle';
  private isPlayingState = false;
  private volume = 90;
  private lastKnownTime = 0;
  private playRequestSeq = 0;

  private ytApiPromise: Promise<YTNamespace | null> | null = null;
  private ytPlayer: YTPlayerInstance | null = null;
  private ytPlayerReadyPromise: Promise<YTPlayerInstance | null> | null = null;
  private ytRootNode: HTMLDivElement | null = null;
  private ytPlayerMountNode: HTMLDivElement | null = null;
  private attachedHostElement: HTMLElement | null = null;
  private pollTimerId: number | null = null;

  private offlineAudio: HTMLAudioElement | null = null;
  private offlineObjectUrl: string | null = null;
  private preferredSinkId: string = 'default';

  private candidateVideoIds: string[] = [];
  private candidateIndex = 0;
  private videoIdCache = new Map<string, string[]>();

  constructor(callbacks?: PlayerEngineCallbacks) {
    if (callbacks) this.callbacks = callbacks;
    this.hydrateVideoCache();
  }

  public setCallbacks(callbacks: PlayerEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  public getSource(): PlaybackSource {
    return this.source;
  }

  public getIsPlaying(): boolean {
    return this.isPlayingState;
  }

  public getCurrentTime(): number {
    if (this.offlineAudio && this.source === 'offline-blob') {
      const t = this.offlineAudio.currentTime;
      if (Number.isFinite(t)) return t;
    }
    if (this.ytPlayer && this.source === 'youtube') {
      try {
        const t = this.ytPlayer.getCurrentTime();
        if (Number.isFinite(t)) return t;
      } catch {
        // fallback to lastKnownTime
      }
    }
    return this.lastKnownTime;
  }

  private ensureOfflineAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (this.offlineAudio) return this.offlineAudio;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = this.volume / 100;

    audio.addEventListener('timeupdate', () => {
      if (this.source !== 'offline-blob') return;
      const t = Number.isFinite(audio.currentTime) ? audio.currentTime : this.lastKnownTime;
      const d =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : this.currentTrack?.duration ?? 0;
      this.lastKnownTime = t;
      this.callbacks.onTimeUpdate?.(t, d);
    });

    audio.addEventListener('play', () => {
      if (this.source !== 'offline-blob') return;
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, 'offline-blob', this.currentTrack);
    });

    audio.addEventListener('pause', () => {
      if (this.source !== 'offline-blob' || audio.ended) return;
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, 'offline-blob', this.currentTrack);
    });

    audio.addEventListener('ended', () => {
      if (this.source !== 'offline-blob') return;
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, 'offline-blob', this.currentTrack);
      this.callbacks.onEnded?.();
    });

    audio.addEventListener('error', () => {
      if (this.source !== 'offline-blob') return;
      this.isPlayingState = false;
      this.source = 'idle';
      this.callbacks.onStateChange?.(false, 'idle', this.currentTrack);
      if (this.currentTrack) {
        this.callbacks.onError?.(STREAM_UNAVAILABLE_MESSAGE, this.currentTrack);
      }
    });

    this.offlineAudio = audio;
    if (this.preferredSinkId && this.preferredSinkId !== 'default') {
      void this.applySinkIdToElement(audio, this.preferredSinkId);
    }
    return audio;
  }

  private async applySinkIdToElement(audio: HTMLAudioElement, sinkId: string): Promise<boolean> {
    const audioWithSink = audio as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof audioWithSink.setSinkId !== 'function') return false;
    try {
      await audioWithSink.setSinkId(sinkId);
      return true;
    } catch {
      return false;
    }
  }

  public async setAudioSinkId(sinkId: string): Promise<boolean> {
    this.preferredSinkId = sinkId || 'default';
    if (!this.offlineAudio) return false;
    return await this.applySinkIdToElement(this.offlineAudio, this.preferredSinkId);
  }

  private teardownOfflinePlayback(): void {
    if (this.offlineAudio) {
      try {
        this.offlineAudio.pause();
        this.offlineAudio.removeAttribute('src');
        this.offlineAudio.load();
      } catch {
        // ignore
      }
    }
    if (this.offlineObjectUrl) {
      try {
        URL.revokeObjectURL(this.offlineObjectUrl);
      } catch {
        // ignore
      }
      this.offlineObjectUrl = null;
    }
  }

  private hydrateVideoCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(YT_VIDEO_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string | string[]>;
      for (const [trackId, value] of Object.entries(parsed)) {
        const list = Array.isArray(value) ? value : [value];
        const valid = list
          .filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id))
          .slice(0, 3);
        if (valid.length > 0) {
          this.videoIdCache.set(trackId, valid);
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveVideoToCache(trackId: string, videoIds: string[]): void {
    const clean = Array.from(
      new Set(videoIds.filter((id) => /^[a-zA-Z0-9_-]{11}$/.test(id))),
    ).slice(0, 3);
    if (clean.length === 0) return;

    this.videoIdCache.set(trackId, clean);
    if (typeof window === 'undefined') return;
    try {
      const entries = Array.from(this.videoIdCache.entries()).slice(-200);
      window.localStorage.setItem(YT_VIDEO_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // ignore quota errors
    }
  }

  private ensureRootNode(): HTMLDivElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.ytRootNode) {
      const wrapper = document.createElement('div');
      wrapper.style.width = '240px';
      wrapper.style.height = '240px';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.overflow = 'hidden';

      const mount = document.createElement('div');
      mount.id = 'klyn-yt-player-mount';
      mount.style.width = '240px';
      mount.style.height = '240px';
      wrapper.appendChild(mount);

      this.ytRootNode = wrapper;
      this.ytPlayerMountNode = mount;
    }

    if (this.attachedHostElement && this.ytRootNode.parentElement !== this.attachedHostElement) {
      this.ytRootNode.style.position = 'relative';
      this.ytRootNode.style.left = '0';
      this.ytRootNode.style.top = '0';
      this.ytRootNode.style.zIndex = '0';
      this.ytRootNode.style.opacity = '1';
      this.attachedHostElement.appendChild(this.ytRootNode);
    } else if (!this.attachedHostElement && !this.ytRootNode.parentElement) {
      // Safe visible-dimension off-overlay anchor until FullScreenPlayer cover mounts
      this.ytRootNode.style.position = 'fixed';
      this.ytRootNode.style.left = '0px';
      this.ytRootNode.style.top = '0px';
      this.ytRootNode.style.zIndex = '-1';
      this.ytRootNode.style.opacity = '0.001';
      document.body.appendChild(this.ytRootNode);
    }

    return this.ytRootNode;
  }

  public attachYouTubeHost(element: HTMLElement | null): void {
    this.attachedHostElement = element;
    if (typeof document === 'undefined') return;
    if (element) {
      this.ensureRootNode();
    } else if (this.ytRootNode && document.body) {
      this.ytRootNode.style.position = 'fixed';
      this.ytRootNode.style.left = '0px';
      this.ytRootNode.style.top = '0px';
      this.ytRootNode.style.zIndex = '-1';
      this.ytRootNode.style.opacity = '0.001';
      document.body.appendChild(this.ytRootNode);
    }
  }

  public loadYouTubeIframeApi(): Promise<YTNamespace | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (this.ytApiPromise) return this.ytApiPromise;

    this.ytApiPromise = new Promise<YTNamespace | null>((resolve) => {
      const timeoutId = window.setTimeout(() => resolve(window.YT ?? null), 8000);
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        window.clearTimeout(timeoutId);
        prevReady?.();
        resolve(window.YT ?? null);
      };

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src*="youtube.com/iframe_api"]',
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
    });

    return this.ytApiPromise;
  }

  private async ensureYTPlayer(): Promise<YTPlayerInstance | null> {
    if (this.ytPlayer) return this.ytPlayer;
    if (this.ytPlayerReadyPromise) return this.ytPlayerReadyPromise;

    this.ytPlayerReadyPromise = (async () => {
      const YT = await this.loadYouTubeIframeApi();
      const root = this.ensureRootNode();
      if (!YT?.Player || !root || !this.ytPlayerMountNode) return null;

      return await new Promise<YTPlayerInstance | null>((resolve) => {
        let settled = false;
        const readyTimer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(this.ytPlayer);
          }
        }, 7000);

        const player = new YT.Player(this.ytPlayerMountNode!, {
          width: 240,
          height: 240,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              this.ytPlayer = event.target;
              try {
                event.target.setVolume(this.volume);
              } catch {
                // ignore
              }
              if (!settled) {
                settled = true;
                window.clearTimeout(readyTimer);
                resolve(event.target);
              }
            },
            onStateChange: (event) => {
              this.handleYTStateChange(event.data);
            },
            onError: (event) => {
              this.handleYTError(event.data);
            },
          },
        });

        this.ytPlayer = player;
      });
    })();

    return this.ytPlayerReadyPromise;
  }

  private startTimePolling(): void {
    this.stopTimePolling();
    if (typeof window === 'undefined') return;
    this.pollTimerId = window.setInterval(() => {
      if (!this.ytPlayer || this.source !== 'youtube' || !this.isPlayingState) return;
      try {
        const current = this.ytPlayer.getCurrentTime();
        const duration = this.ytPlayer.getDuration();
        const safeTime = Number.isFinite(current) ? current : this.lastKnownTime;
        const safeDuration =
          Number.isFinite(duration) && duration > 0 ? duration : this.currentTrack?.duration ?? 0;
        this.lastKnownTime = safeTime;
        this.callbacks.onTimeUpdate?.(safeTime, safeDuration);
      } catch {
        // ignore transient IFrame messaging issues
      }
    }, 250);
  }

  private stopTimePolling(): void {
    if (this.pollTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
  }

  private handleYTStateChange(state: number): void {
    const YT = window.YT;
    const PLAYING = YT?.PlayerState?.PLAYING ?? 1;
    const PAUSED = YT?.PlayerState?.PAUSED ?? 2;
    const ENDED = YT?.PlayerState?.ENDED ?? 0;

    if (state === PLAYING) {
      this.source = 'youtube';
      this.isPlayingState = true;
      try {
        const t = this.ytPlayer?.getCurrentTime() ?? this.lastKnownTime;
        const d = this.ytPlayer?.getDuration() ?? this.currentTrack?.duration ?? 0;
        this.lastKnownTime = Number.isFinite(t) ? t : 0;
        this.callbacks.onTimeUpdate?.(
          this.lastKnownTime,
          Number.isFinite(d) && d > 0 ? d : this.currentTrack?.duration ?? 0,
        );
      } catch {
        // ignore
      }
      this.startTimePolling();
      this.callbacks.onStateChange?.(true, 'youtube', this.currentTrack);
    } else if (state === PAUSED) {
      this.isPlayingState = false;
      this.stopTimePolling();
      this.callbacks.onStateChange?.(false, 'youtube', this.currentTrack);
    } else if (state === ENDED) {
      this.isPlayingState = false;
      this.stopTimePolling();
      this.callbacks.onStateChange?.(false, 'youtube', this.currentTrack);
      this.callbacks.onEnded?.();
    }
  }

  private handleYTError(errorCode: number): void {
    // Rotate candidate videoId on embed restriction / error (e.g. 101, 150, 100)
    const nextIdx = this.candidateIndex + 1;
    if (
      (errorCode === 101 || errorCode === 150 || errorCode === 100 || nextIdx < this.candidateVideoIds.length) &&
      nextIdx < this.candidateVideoIds.length &&
      this.ytPlayer &&
      this.currentTrack
    ) {
      this.candidateIndex = nextIdx;
      const fallbackId = this.candidateVideoIds[nextIdx];
      // Prioritize working candidate first in klyn_yt_vid_cache_v1 while preserving alternatives
      const reordered = [
        fallbackId,
        ...this.candidateVideoIds.filter((id) => id !== fallbackId),
      ];
      this.saveVideoToCache(this.currentTrack.id, reordered);
      try {
        this.ytPlayer.loadVideoById({ videoId: fallbackId, startSeconds: this.lastKnownTime });
        return;
      } catch {
        // fall through to error notification
      }
    }

    this.stopTimePolling();
    this.isPlayingState = false;
    this.source = 'idle';
    this.callbacks.onStateChange?.(false, 'idle', this.currentTrack);
    if (this.currentTrack) {
      this.callbacks.onError?.(STREAM_UNAVAILABLE_MESSAGE, this.currentTrack);
    }
  }

  private async resolveYouTubeVideoIds(track: Track): Promise<string[]> {
    const candidates: string[] = [];
    const pushCandidate = (id: string | null | undefined) => {
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id) && !candidates.includes(id)) {
        candidates.push(id);
      }
    };

    // 1. Check direct youtubeId & klyn_yt_vid_cache_v1 first (zero YouTube Data API quota usage on cache hit)
    pushCandidate(track.youtubeId);
    const cachedList = this.videoIdCache.get(track.id);
    if (cachedList && cachedList.length > 0) {
      cachedList.forEach(pushCandidate);
      if (candidates.length > 0) {
        return candidates.slice(0, 3);
      }
    }
    if (candidates.length > 0 && track.youtubeId) {
      return candidates;
    }

    const query = `${track.title} ${track.artist} official audio`.trim();

    // 2. Primary Resolver: Official YouTube Data API v3 (CORS-enabled, embeddable music videos)
    const ytApiKey = getConfiguredYouTubeApiKey();
    if (ytApiKey) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      try {
        const apiUrl =
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=3` +
          `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(ytApiKey)}`;
        const res = await fetch(apiUrl, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as YouTubeSearchResponse;
          for (const item of data.items ?? []) {
            pushCandidate(item.id?.videoId);
          }
        }
      } catch {
        // Fall through cleanly if network/quota fails
      } finally {
        window.clearTimeout(timer);
      }
    }

    // 3. Fallback public search race only if YouTube Data API key is unconfigured or yielded 0 results
    if (candidates.length === 0) {
      const fetchPiped = async (base: string, filter: 'music_songs' | 'videos'): Promise<string[]> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(
            `${base}/search?q=${encodeURIComponent(query)}&filter=${filter}`,
            { mode: 'cors', signal: controller.signal },
          );
          if (!res.ok) throw new Error(`Piped ${res.status}`);
          const json = (await res.json()) as { items?: PipedSearchItem[] };
          const ids = (json.items ?? [])
            .filter((item) => !item.type || item.type === 'stream')
            .map((item) => item.id || extractIdFromPipedUrl(item.url))
            .filter((id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id)));
          if (ids.length === 0) throw new Error('No videoIds');
          return ids.slice(0, 3);
        } finally {
          window.clearTimeout(timer);
        }
      };

      const fetchInvidious = async (base: string): Promise<string[]> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(
            `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
            { mode: 'cors', signal: controller.signal },
          );
          if (!res.ok) throw new Error(`Invidious ${res.status}`);
          const json = (await res.json()) as InvidiousSearchItem[];
          const ids = (json ?? [])
            .map((item) => item.videoId)
            .filter((id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id)));
          if (ids.length === 0) throw new Error('No Invidious videoIds');
          return ids.slice(0, 3);
        } finally {
          window.clearTimeout(timer);
        }
      };

      try {
        const winnerIds = await Promise.any([
          ...PIPED_SEARCH_INSTANCES.map((inst) => fetchPiped(inst, 'music_songs')),
          ...INVIDIOUS_SEARCH_INSTANCES.map((inst) => fetchInvidious(inst)),
        ]);
        winnerIds.forEach(pushCandidate);
      } catch {
        try {
          const videoWinnerIds = await Promise.any(
            PIPED_SEARCH_INSTANCES.map((inst) => fetchPiped(inst, 'videos')),
          );
          videoWinnerIds.forEach(pushCandidate);
        } catch {
          // All fallback resolvers failed or timed out
        }
      }
    }

    if (candidates.length > 0) {
      this.saveVideoToCache(track.id, candidates);
    }
    return candidates.slice(0, 3);
  }

  public async playTrack(track: Track, startAtTime = 0): Promise<void> {
    const seq = ++this.playRequestSeq;
    this.currentTrack = track;
    this.lastKnownTime = Math.max(0, startAtTime);
    this.stopTimePolling();

    // 1. Check IndexedDB offline cache first (audio_blobs + cached track metadata)
    const [cachedBlobEntry, cachedTrackEntry] = await Promise.all([
      getCachedAudioBlobEntry(track.id).catch(() => null),
      getCachedTrackEntry(track.id).catch(() => null),
    ]);

    if (seq !== this.playRequestSeq) return;

    const resolvedTrack: Track =
      cachedTrackEntry?.track
        ? {
            ...track,
            youtubeId: track.youtubeId || cachedTrackEntry.track.youtubeId,
            coverUrl: track.coverUrl || cachedTrackEntry.coverUrl,
          }
        : track;
    this.currentTrack = resolvedTrack;

    if (cachedBlobEntry?.blob instanceof Blob) {
      if (this.ytPlayer) {
        try {
          this.ytPlayer.pauseVideo();
        } catch {
          // ignore
        }
      }
      this.teardownOfflinePlayback();
      const audio = this.ensureOfflineAudio();
      if (audio) {
        try {
          const objectUrl = URL.createObjectURL(cachedBlobEntry.blob);
          this.offlineObjectUrl = objectUrl;
          this.source = 'offline-blob';
          audio.src = objectUrl;
          audio.volume = this.volume / 100;
          if (startAtTime > 0) {
            audio.currentTime = startAtTime;
          }
          await audio.play();
          if (seq !== this.playRequestSeq) return;
          this.isPlayingState = true;
          this.callbacks.onStateChange?.(true, 'offline-blob', resolvedTrack);
          return;
        } catch {
          this.teardownOfflinePlayback();
        }
      }
    }

    // 2. Stream via masked YouTube IFrame API (using cached youtubeId when available)
    this.teardownOfflinePlayback();
    const [player, videoIds] = await Promise.all([
      this.ensureYTPlayer(),
      this.resolveYouTubeVideoIds(resolvedTrack),
    ]);

    if (seq !== this.playRequestSeq) return;

    if (!player || videoIds.length === 0) {
      this.source = 'idle';
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, 'idle', this.currentTrack);
      this.callbacks.onError?.(STREAM_UNAVAILABLE_MESSAGE, resolvedTrack);
      return;
    }

    this.candidateVideoIds = videoIds;
    this.candidateIndex = 0;
    this.source = 'youtube';

    // Persist track metadata & resolved YouTube reference cleanly in IndexedDB cache
    void cacheTrackOffline(
      { ...resolvedTrack, youtubeId: resolvedTrack.youtubeId || videoIds[0] },
      { audioUrl: `https://www.youtube.com/watch?v=${videoIds[0]}` },
    );

    try {
      player.setVolume(this.volume);
      player.loadVideoById({
        videoId: videoIds[0],
        startSeconds: Math.max(0, startAtTime),
      });
      player.playVideo();
      this.isPlayingState = true;
      this.startTimePolling();
      this.callbacks.onStateChange?.(true, 'youtube', resolvedTrack);
    } catch {
      this.source = 'idle';
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, 'idle', resolvedTrack);
      this.callbacks.onError?.(STREAM_UNAVAILABLE_MESSAGE, resolvedTrack);
    }
  }

  public async togglePlay(): Promise<boolean> {
    if (!this.currentTrack) return false;
    if (this.isPlayingState) {
      this.pause();
      return false;
    }
    return await this.resume();
  }

  public async resume(): Promise<boolean> {
    if (!this.currentTrack) return false;
    if (this.offlineAudio && this.source === 'offline-blob') {
      try {
        await this.offlineAudio.play();
        this.isPlayingState = true;
        this.callbacks.onStateChange?.(true, 'offline-blob', this.currentTrack);
        return true;
      } catch {
        // Fallback to playTrack
      }
    }
    if (this.ytPlayer && this.source === 'youtube') {
      try {
        this.ytPlayer.playVideo();
        this.isPlayingState = true;
        this.startTimePolling();
        this.callbacks.onStateChange?.(true, 'youtube', this.currentTrack);
        return true;
      } catch {
        // Fallback to reloading track
      }
    }
    await this.playTrack(this.currentTrack, this.lastKnownTime);
    return this.isPlayingState;
  }

  public pause(): void {
    this.isPlayingState = false;
    this.stopTimePolling();
    if (this.offlineAudio && this.source === 'offline-blob') {
      try {
        this.offlineAudio.pause();
      } catch {
        // ignore
      }
    }
    if (this.ytPlayer) {
      try {
        this.ytPlayer.pauseVideo();
      } catch {
        // ignore
      }
    }
    this.callbacks.onStateChange?.(false, this.source, this.currentTrack);
  }

  public seekTo(seconds: number): void {
    const fallbackDuration = this.currentTrack?.duration ?? 0;
    let liveDuration = fallbackDuration;
    if (this.offlineAudio && this.source === 'offline-blob') {
      if (Number.isFinite(this.offlineAudio.duration) && this.offlineAudio.duration > 0) {
        liveDuration = this.offlineAudio.duration;
      }
    } else if (this.ytPlayer) {
      try {
        const d = this.ytPlayer.getDuration();
        if (Number.isFinite(d) && d > 0) liveDuration = d;
      } catch {
        // ignore
      }
    }
    const maxBounds = liveDuration > 0 ? liveDuration : Math.max(0, seconds);
    const clamped = Math.min(maxBounds, Math.max(0, seconds));
    this.lastKnownTime = clamped;

    if (this.offlineAudio && this.source === 'offline-blob') {
      try {
        this.offlineAudio.currentTime = clamped;
      } catch {
        // ignore
      }
    } else if (this.ytPlayer && this.source === 'youtube') {
      try {
        this.ytPlayer.seekTo(clamped, true);
      } catch {
        // ignore
      }
    }

    this.callbacks.onTimeUpdate?.(clamped, liveDuration);
  }

  public setVolume(value: number): void {
    const normalized = Math.min(1, Math.max(0, value));
    this.volume = Math.round(normalized * 100);
    if (this.offlineAudio) {
      this.offlineAudio.volume = normalized;
    }
    if (this.ytPlayer) {
      try {
        this.ytPlayer.setVolume(this.volume);
      } catch {
        // ignore
      }
    }
  }

  public destroy(): void {
    this.stopTimePolling();
    this.teardownOfflinePlayback();
    this.offlineAudio = null;
    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy();
      } catch {
        // ignore
      }
      this.ytPlayer = null;
    }
    this.ytRootNode?.remove();
    this.ytRootNode = null;
    this.ytPlayerMountNode = null;
  }
}

export const playerEngine = new PlayerEngine();
