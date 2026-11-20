export interface LyricLine {
  time: number; // seconds
  text: string;
}

export type TrackCategory = 'Music' | 'Spatial' | 'Mixes';

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
  quality: 'Dolby Atmos' | 'Hi-Res Lossless' | 'Lossless';
  coverUrl: string;
  fallbackGradient: string;
  playlistName: string;
  year: number;
  plays: number;
  downloaded?: boolean;
  youtubeId?: string;
  artistId?: number;
  collectionId?: number;
  isExternal?: boolean;
  lyricsLoading?: boolean;
  lyrics: LyricLine[];
}

export interface ArtistAlbum {
  id: string;
  collectionId?: number;
  title: string;
  year: number;
  type: 'Album' | 'Single' | 'EP';
  coverUrl: string;
  trackIds: string[];
}

export interface ArtistProfile {
  id: string;
  artistId?: number;
  name: string;
  verified: boolean;
  monthlyListeners: string;
  bio: string;
  coverUrl: string;
  accentColor: string;
  genre: string;
  upcomingRelease?: {
    title: string;
    date: string;
    type: 'Single' | 'Album' | 'EP';
  };
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
  pinned?: boolean;
  downloaded?: boolean;
  accentGradient?: string;
  displayMode?: PlaylistDisplayMode;
  showQualityBadges?: boolean;
  isAiBlend?: boolean;
  blendMatchPct?: number;
  sharedWithFriendId?: string;
}

export interface LikedSongsCustomization {
  title: string;
  description: string;
  pinned: boolean;
  accentGradient: string;
  displayMode: PlaylistDisplayMode;
  showQualityBadges: boolean;
}

export interface AudioDevice {
  id: string;
  name: string;
  type: 'headphones' | 'speaker' | 'desktop' | 'phone' | 'bluetooth';
  detail: string;
  source?: 'system' | 'audiooutput' | 'bluetooth';
  sinkId?: string;
  bluetoothId?: string;
  connected?: boolean;
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

export type TopFilterTab = 'All' | 'Music' | 'Spatial' | 'Mixes';
export type NavTab = 'Home' | 'Activity' | 'Search' | 'Library';
export type LibrarySubTab = 'Playlists' | 'Albums' | 'Artists' | 'Downloaded';
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
