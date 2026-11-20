import { Track } from '../types/music';
import { resolveYouTubeCandidatesForTrack } from './musicApi';
import {
  cacheTrackOffline,
  getCachedAudioBlobEntry,
  getCachedTrackEntry,
} from './offlineCache';

export type PlaybackSource = 'offline-blob' | 'audio-url' | 'youtube' | 'idle';

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
  setPlaybackRate?: (suggestedRate: number) => void;
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

const YT_VIDEO_CACHE_KEY = 'klyn_yt_vid_cache_v1';
const YT_VIDEO_CACHE_ALT_KEY = 'klyn_yt_cache_v1';
const STREAM_UNAVAILABLE_MESSAGE = 'Stream unavailable for this track — try another';

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
    externalSource: 'youtube',
    lyrics: [],
  };
}

export class PlayerEngine {
  private callbacks: PlayerEngineCallbacks = {};
  private currentTrack: Track | null = null;
  private source: PlaybackSource = 'idle';
  private isPlayingState = false;
  private volume = 90;
  private playbackRate = 1;
  private lastKnownTime = 0;
  private playRequestSeq = 0;

  private ytApiPromise: Promise<YTNamespace | null> | null = null;
  private ytPlayer: YTPlayerInstance | null = null;
  private ytPlayerReadyPromise: Promise<YTPlayerInstance | null> | null = null;
  private ytRootNode: HTMLDivElement | null = null;
  private ytPlayerMountNode: HTMLDivElement | null = null;
  private attachedHostElement: HTMLElement | null = null;
  private pollTimerId: number | null = null;
  private watchdogTimerId: number | null = null;
  private watchdogProgressCount = 0;

  private offlineAudio: HTMLAudioElement | null = null;
  private offlineObjectUrl: string | null = null;
  private preferredSinkId: string = 'default';

  private audioKeepAliveCtx: AudioContext | null = null;
  private wakeLockSentinel: { release?: () => Promise<void> } | null = null;

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
    if (this.offlineAudio && (this.source === 'offline-blob' || this.source === 'audio-url')) {
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

  public setPlaybackRate(rate: number): void {
    const clamped = Math.min(2.0, Math.max(0.75, rate));
    this.playbackRate = clamped;
    if (this.offlineAudio) {
      try {
        this.offlineAudio.playbackRate = clamped;
      } catch {
        // ignore
      }
    }
    if (this.ytPlayer?.setPlaybackRate) {
      try {
        this.ytPlayer.setPlaybackRate(clamped);
      } catch {
        // ignore
      }
    }
  }

  public skipBy(deltaSeconds: number): void {
    this.seekTo(this.getCurrentTime() + deltaSeconds);
  }

  private activateBackgroundKeepAlive(): void {
    if (typeof window === 'undefined') return;
    // 1. Silent AudioContext keep-alive pulse so mobile/background tabs hold audio focus
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !this.audioKeepAliveCtx) {
        this.audioKeepAliveCtx = new AudioCtx();
      }
      if (this.audioKeepAliveCtx?.state === 'suspended') {
        void this.audioKeepAliveCtx.resume().catch(() => {});
      }
    } catch {
      // ignore unsupported AudioContext
    }

    // 2. Request Screen Wake Lock if supported
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
      };
      if (nav.wakeLock?.request && !this.wakeLockSentinel) {
        void nav.wakeLock
          .request('screen')
          .then((sentinel) => {
            this.wakeLockSentinel = sentinel;
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  private releaseWakeLock(): void {
    if (!this.wakeLockSentinel) return;
    try {
      void this.wakeLockSentinel.release?.().catch(() => {});
    } catch {
      // ignore
    }
    this.wakeLockSentinel = null;
  }

  private startStallWatchdog(_track: Track, seq: number): void {
    this.stopStallWatchdog();
    if (typeof window === 'undefined') return;
    const baselineTime = this.lastKnownTime;
    this.watchdogProgressCount = 0;

    this.watchdogTimerId = window.setTimeout(() => {
      if (seq !== this.playRequestSeq || !this.isPlayingState) return;
      if (this.source !== 'youtube') return;
      const nowTime = this.getCurrentTime();
      if (Math.abs(nowTime - baselineTime) < 0.25 && this.watchdogProgressCount < 1) {
        // Attempt candidate rotation on stalled YouTube load
        this.handleYTError(150);
      }
    }, 3500);
  }

  private stopStallWatchdog(): void {
    if (this.watchdogTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.watchdogTimerId);
      this.watchdogTimerId = null;
    }
  }

  private ensureOfflineAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (this.offlineAudio) return this.offlineAudio;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = this.volume / 100;
    audio.playbackRate = this.playbackRate;

    audio.addEventListener('timeupdate', () => {
      if (this.source !== 'offline-blob' && this.source !== 'audio-url') return;
      const t = Number.isFinite(audio.currentTime) ? audio.currentTime : this.lastKnownTime;
      const d =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : this.currentTrack?.duration ?? 0;
      this.lastKnownTime = t;
      this.callbacks.onTimeUpdate?.(t, d);
    });

    audio.addEventListener('play', () => {
      if (this.source !== 'offline-blob' && this.source !== 'audio-url') return;
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, this.source, this.currentTrack);
    });

    audio.addEventListener('pause', () => {
      if ((this.source !== 'offline-blob' && this.source !== 'audio-url') || audio.ended) return;
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, this.source, this.currentTrack);
    });

    audio.addEventListener('ended', () => {
      if (this.source !== 'offline-blob' && this.source !== 'audio-url') return;
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, this.source, this.currentTrack);
      this.callbacks.onEnded?.();
    });

    audio.addEventListener('error', () => {
      if (this.source !== 'offline-blob' && this.source !== 'audio-url') return;
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
    for (const key of [YT_VIDEO_CACHE_KEY, YT_VIDEO_CACHE_ALT_KEY]) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Record<string, string | string[]>;
        for (const [trackId, value] of Object.entries(parsed)) {
          const list = Array.isArray(value) ? value : [value];
          const valid = list
            .filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id))
            .slice(0, 3);
          if (valid.length > 0 && !this.videoIdCache.has(trackId)) {
            this.videoIdCache.set(trackId, valid);
          }
        }
      } catch {
        // ignore storage errors
      }
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
      const serialized = JSON.stringify(Object.fromEntries(entries));
      window.localStorage.setItem(YT_VIDEO_CACHE_KEY, serialized);
      window.localStorage.setItem(YT_VIDEO_CACHE_ALT_KEY, serialized);
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
                event.target.setPlaybackRate?.(this.playbackRate);
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
        if (Math.abs(safeTime - this.lastKnownTime) > 0.08) {
          this.watchdogProgressCount += 1;
          this.stopStallWatchdog();
        }
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
      this.stopStallWatchdog();
      try {
        const t = this.ytPlayer?.getCurrentTime() ?? this.lastKnownTime;
        const d = this.ytPlayer?.getDuration() ?? this.currentTrack?.duration ?? 0;
        this.lastKnownTime = Number.isFinite(t) ? t : 0;
        this.ytPlayer?.setPlaybackRate?.(this.playbackRate);
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
      this.stopStallWatchdog();
      this.callbacks.onStateChange?.(false, 'youtube', this.currentTrack);
    } else if (state === ENDED) {
      this.isPlayingState = false;
      this.stopTimePolling();
      this.stopStallWatchdog();
      this.callbacks.onStateChange?.(false, 'youtube', this.currentTrack);
      this.callbacks.onEnded?.();
    }
  }

  private handleYTError(errorCode: number): void {
    this.stopStallWatchdog();
    const nextIdx = this.candidateIndex + 1;
    if (
      (errorCode === 101 || errorCode === 150 || errorCode === 100 || nextIdx < this.candidateVideoIds.length) &&
      nextIdx < this.candidateVideoIds.length &&
      this.ytPlayer &&
      this.currentTrack
    ) {
      this.candidateIndex = nextIdx;
      const fallbackId = this.candidateVideoIds[nextIdx];
      const reordered = [
        fallbackId,
        ...this.candidateVideoIds.filter((id) => id !== fallbackId),
      ];
      this.saveVideoToCache(this.currentTrack.id, reordered);
      try {
        this.ytPlayer.loadVideoById({ videoId: fallbackId, startSeconds: this.lastKnownTime });
        return;
      } catch {
        // fall through to preview or error notification
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

    const resolved = await resolveYouTubeCandidatesForTrack(track);
    resolved.forEach(pushCandidate);

    if (candidates.length > 0) {
      this.saveVideoToCache(track.id, candidates);
    }
    return candidates.slice(0, 3);
  }

  public prewarmTrack(track: Track | null): void {
    if (!track || track.isPodcastEpisode || track.isAudiobookChapter) return;
    if (this.videoIdCache.has(track.id) || track.youtubeId) return;
    void this.resolveYouTubeVideoIds(track).catch(() => {});
  }

  public async playTrack(track: Track, startAtTime = 0): Promise<void> {
    const seq = ++this.playRequestSeq;
    this.currentTrack = track;
    this.lastKnownTime = Math.max(0, startAtTime);
    this.stopTimePolling();
    this.stopStallWatchdog();
    this.activateBackgroundKeepAlive();

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
          audio.playbackRate = this.playbackRate;
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

    // 1b. Direct audio stream for Podcasts / Audiobooks when no blob is cached
    if ((resolvedTrack.isPodcastEpisode || resolvedTrack.isAudiobookChapter) && resolvedTrack.audioStreamUrl) {
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
          this.source = 'audio-url';
          audio.src = resolvedTrack.audioStreamUrl;
          audio.volume = this.volume / 100;
          audio.playbackRate = this.playbackRate;
          if (startAtTime > 0) {
            audio.currentTime = startAtTime;
          }
          await audio.play();
          if (seq !== this.playRequestSeq) return;
          this.isPlayingState = true;
          this.callbacks.onStateChange?.(true, 'audio-url', resolvedTrack);
          return;
        } catch {
          this.teardownOfflinePlayback();
        }
      }
    }

    // 2. Full-length playback strictly via YouTube Audio IFrame Engine (no 30s previews outside Reels)
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

    void cacheTrackOffline(
      { ...resolvedTrack, youtubeId: resolvedTrack.youtubeId || videoIds[0] },
      { audioUrl: `https://www.youtube.com/watch?v=${videoIds[0]}` },
    );

    try {
      player.setVolume(this.volume);
      player.setPlaybackRate?.(this.playbackRate);
      player.loadVideoById({
        videoId: videoIds[0],
        startSeconds: Math.max(0, startAtTime),
      });
      player.playVideo();

      this.source = 'youtube';
      this.isPlayingState = true;
      this.startTimePolling();
      this.callbacks.onStateChange?.(true, 'youtube', resolvedTrack);
      this.startStallWatchdog(resolvedTrack, seq);
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
    this.activateBackgroundKeepAlive();
    if (this.offlineAudio && (this.source === 'offline-blob' || this.source === 'audio-url')) {
      try {
        await this.offlineAudio.play();
        this.isPlayingState = true;
        this.callbacks.onStateChange?.(true, this.source, this.currentTrack);
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
    this.stopStallWatchdog();
    this.releaseWakeLock();
    if (this.offlineAudio && (this.source === 'offline-blob' || this.source === 'audio-url')) {
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
    if (this.offlineAudio && (this.source === 'offline-blob' || this.source === 'audio-url')) {
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

    if (this.offlineAudio && (this.source === 'offline-blob' || this.source === 'audio-url')) {
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
    this.stopStallWatchdog();
    this.releaseWakeLock();
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
