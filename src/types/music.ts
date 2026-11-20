export interface LyricLine {
  time: number; // seconds (-1 when plain unsynced text)
  text: string;
}

export type TrackCategory = 'Music' | 'Mixes';

export type ShuffleMode = 'off' | 'shuffle' | 'smart';

export type ConnectedAppProvider = 'spotify' | 'audiomack' | 'soundcloud' | 'tunesimo';

export interface ConnectedAppEntry {
  provider: ConnectedAppProvider;
  connected: boolean;
  connectedAt?: string;
  profileUrl?: string;
  handleOrId?: string;
  importedCount?: number;
  lastSyncedAt?: string;
  syncError?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  primaryColor: string;
  secondaryColor: string;
  genre: string;
  category: TrackCategory;
  quality: 'Hi-Res Lossless' | 'Lossless';
  coverUrl: string;
  fallbackGradient: string;
  playlistName: string;
  year: number;
  plays: number;
  popularity?: number;
  explicit?: boolean;
  previewUrl?: string;
  downloaded?: boolean;
  youtubeId?: string;
  spotifyId?: string;
  spotifyArtistId?: string;
  spotifyUrl?: string;
  artistId?: number;
  collectionId?: number;
  isExternal?: boolean;
  externalSource?: 'itunes' | 'youtube' | 'spotify' | 'audiomack' | 'soundcloud' | 'tunesimo';
  isPodcastEpisode?: boolean;
  isAudiobookChapter?: boolean;
  showId?: string;
  audioStreamUrl?: string;
  lyricsLoading?: boolean;
  lyrics: LyricLine[];
}

export type ShowKind = 'podcast' | 'audiobook';

export interface ShowEpisode {
  id: string;
  showId: string;
  title: string;
  author: string;
  description?: string;
  duration: number;
  releaseDate?: string;
  audioUrl?: string;
  coverUrl: string;
  episodeNumber?: number;
}

export interface PodcastShow {
  id: string;
  title: string;
  author: string;
  kind: ShowKind;
  genre: string;
  description: string;
  coverUrl: string;
  feedUrl?: string;
  episodes: ShowEpisode[];
}

export interface ShowProgressEntry {
  showId: string;
  episodeId: string;
  position: number;
  speed: number;
  updatedAt: number;
}

export interface ArtistAlbum {
  id: string;
  collectionId?: number;
  spotifyId?: string;
  spotifyUrl?: string;
  title: string;
  year: number;
  type: 'Album' | 'Single' | 'EP';
  coverUrl: string;
  trackIds: string[];
}

export interface ArtistProfile {
  id: string;
  artistId?: number;
  spotifyId?: string;
  spotifyUrl?: string;
  followersTotal?: number;
  popularity?: number;
  genres?: string[];
  name: string;
  verified: boolean;
  monthlyListeners: string;
  bio: string;
  coverUrl: string;
  accentColor: string;
  genre: string;
  albums: ArtistAlbum[];
}

export type PlaylistDisplayMode = 'comfortable' | 'compact';

export interface PlaylistItem {
  id: string;
  title: string;
  curator: string;
  description: string;
  trackIds: string[];
  coverUrl: string;
  spotifyId?: string;
  spotifyUrl?: string;
  pinned?: boolean;
  downloaded?: boolean;
  accentGradient?: string;
  displayMode?: PlaylistDisplayMode;
  showQualityBadges?: boolean;
  isAiBlend?: boolean;
  blendMatchPct?: number;
  sharedWithFriendId?: string;
  sourceProvider?: ConnectedAppProvider;
}

export interface LikedSongsCustomization {
  title: string;
  description: string;
  pinned: boolean;
  accentGradient: string;
  displayMode: PlaylistDisplayMode;
  showQualityBadges: boolean;
}

export type BluetoothConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected';

export interface AudioDevice {
  id: string;
  name: string;
  type: 'headphones' | 'speaker' | 'desktop' | 'phone' | 'bluetooth';
  detail: string;
  source?: 'system' | 'audiooutput' | 'bluetooth';
  sinkId?: string;
  bluetoothId?: string;
  connected?: boolean;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
}

export interface BatterySnapshot {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
  chargingTime: number | null;
  dischargingTime: number | null;
  updatedAt: number;
}

export interface AccountDeviceRecord {
  deviceId: string;
  name: string;
  platform: string;
  isCurrentDevice?: boolean;
  isPlaying: boolean;
  activeTrackId?: string;
  activeTrackTitle?: string;
  activeTrackArtist?: string;
  playbackPosition?: number;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  bluetoothDeviceName?: string;
  bluetoothBatteryLevel?: number | null;
  lastSeen: number;
}

export interface ListeningLogEntry {
  id: string;
  trackId: string;
  playedAtLabel: string;
  playCount: number;
  timestamp?: number;
}

export interface PlayEvent {
  ts: number;
  trackId: string;
  artist: string;
  album: string;
  seconds: number;
}

export type ActivityPeriod = 'This Week' | '30 Days' | 'All Time';

export type TopFilterTab = 'All' | 'Music' | 'Mixes';
export type NavTab = 'Home' | 'Reels' | 'Search' | 'Activity' | 'Library';
export type LibrarySubTab = 'Playlists' | 'Albums' | 'Artists' | 'Shows' | 'Downloaded';
export type RepeatMode = 'off' | 'all' | 'one';
export type StreamingQuality = 'Low' | 'Normal' | 'High' | 'Lossless';
export type DownloadQuality = 'Normal' | 'High' | 'Lossless';
export type CrossfadeDuration = 0 | 3 | 6 | 12;
export type AvatarStyle = 'monogram' | 'obsidian-ring' | 'glass-emblem' | 'halo';

export interface UserPreferences {
  streamingQuality: StreamingQuality;
  downloadQuality: DownloadQuality;
  spatialEnabled: boolean;
  normalizeVolume: boolean;
  gaplessPlayback: boolean;
  crossfadeSeconds: CrossfadeDuration;
  autoplaySimilar: boolean;
  autoScrollLyrics: boolean;
  offlineMode?: boolean;
  playbackSpeed?: number;
  layoutMode?: 'auto' | 'desktop' | 'mobile';
  // Notifications
  notifyNewReleases: boolean;
  notifyWrappedWeekly: boolean;
  notifyPlaylistUpdates: boolean;
  notifyPushAlerts: boolean;
  notifySocialInvites: boolean;
  notifyStreakAlerts: boolean;
  // Privacy
  listeningVisibility: boolean;
  privateSession: boolean;
  shareArtistAnalytics: boolean;
}

export interface FriendSharedPlaylist {
  id: string;
  title: string;
  matchPct: number;
  trackIds: string[];
  createdAtLabel: string;
}

export interface SocialUser {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarUrl?: string;
  isFriend: boolean;
  isOnline: boolean;
  currentTrackId: string;
  lastActiveLabel: string;
  topTrackIds: string[];
  tasteMatchPct: number;
  accentColor: string;
  reaction?: string;
  sharedLibraryPlaylists?: FriendSharedPlaylist[];
}

export interface ListenPartyMessage {
  id: string;
  sender: string;
  text: string;
  timeLabel: string;
}

export interface BlendPlaylistData {
  id: string;
  friendId: string;
  friendName: string;
  matchPct: number;
  trackIds: string[];
}

export interface UserAccount {
  id: string;
  uid?: string;
  authProvider?: 'google' | 'email' | 'local';
  name: string;
  handle: string;
  email: string;
  initials: string;
  avatarUrl?: string;
  avatarStyle: AvatarStyle;
  accentColor: string;
  favoriteGenres: string[];
  hasCompletedOnboarding: boolean;
  notificationsEnabled?: boolean;
  connectedApps?: Partial<Record<ConnectedAppProvider, ConnectedAppEntry>>;
  recentSearches?: string[];
  showProgress?: Record<string, ShowProgressEntry>;
  createdAt: string;
}

export interface ListeningStatsState {
  dailyMinutes: number[];
  dailyMinutesByDate: Record<string, number>;
  activeDates: string[];
  playEvents: PlayEvent[];
  artistPlayCounts: Record<string, number>;
  trackPlayCounts: Record<string, number>;
  recentTrackIds: string[];
  recentLog: ListeningLogEntry[];
  streakDays: number;
}

export type PendingInvitePopup =
  | {
      type: 'blend';
      id: string;
      friend: SocialUser;
      matchPct: number;
      sentAtLabel: string;
    }
  | {
      type: 'listen-party';
      id: string;
      friend: SocialUser;
      track: Track;
      sentAtLabel: string;
    };
