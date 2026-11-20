import {
  ListeningLogEntry,
  PlaylistItem,
  SocialUser,
  Track,
  UserAccount,
} from '../types/music';

export interface KlynAiBlendResult {
  playlist: PlaylistItem;
  matchPct: number;
  summary: string;
}

/**
 * Klyn AI taste-matching engine:
 * Matches the signed-in listener's likes, play history, and favorite genres
 * against a friend's top tracks and signature sound to create a blended playlist.
 */
export function generateKlynAiBlend(params: {
  user: UserAccount;
  friend: SocialUser;
  tracks: Track[];
  favoriteIds: Set<string>;
  playCounts: Record<string, number>;
}): KlynAiBlendResult {
  const { user, friend, tracks, favoriteIds, playCounts } = params;

  const userScored = [...tracks]
    .map((track) => {
      let score = 0;
      if (favoriteIds.has(track.id)) score += 50;
      score += (playCounts[track.id] ?? 0) * 8;
      if (
        user.favoriteGenres.some(
          (g) =>
            track.genre.toLowerCase().includes(g.toLowerCase()) ||
            track.category.toLowerCase().includes(g.toLowerCase()),
        )
      ) {
        score += 28;
      }
      if (track.quality === 'Hi-Res Lossless') score += 6;
      return { track, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.track);

  const friendTracks = friend.topTrackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));

  const mergedIds: string[] = [];
  const maxPairs = Math.max(3, friendTracks.length);
  for (let i = 0; i < maxPairs; i++) {
    const uTrack = userScored[i];
    const fTrack = friendTracks[i];
    if (uTrack && !mergedIds.includes(uTrack.id)) mergedIds.push(uTrack.id);
    if (fTrack && !mergedIds.includes(fTrack.id)) mergedIds.push(fTrack.id);
  }

  for (const t of userScored) {
    if (mergedIds.length >= 6) break;
    if (!mergedIds.includes(t.id)) mergedIds.push(t.id);
  }

  const userTopGenres = new Set(
    [...user.favoriteGenres, ...userScored.slice(0, 3).map((t) => t.genre)].map((g) =>
      g.toLowerCase(),
    ),
  );
  const friendGenres = friendTracks.map((t) => t.genre.toLowerCase());
  const sharedGenreCount = friendGenres.filter((g) => userTopGenres.has(g)).length;
  const matchPct = Math.min(98, Math.max(76, friend.tasteMatchPct + sharedGenreCount * 2));

  const userFirst = user.name.split(' ')[0] || 'You';
  const friendFirst = friend.name.split(' ')[0];
  const dominantUserGenre = userScored[0]?.genre ?? user.favoriteGenres[0] ?? 'Music';
  const dominantFriendGenre = friendTracks[0]?.genre ?? 'Discovery';

  const summary = `Klyn AI matched ${userFirst}'s ${dominantUserGenre} rotation with ${friendFirst}'s ${dominantFriendGenre} favorites (${matchPct}% taste sync).`;

  const leadTrack =
    tracks.find((t) => t.id === mergedIds[0]) ?? friendTracks[0] ?? tracks[0];

  const primaryColor = leadTrack?.primaryColor ?? '#C27838';
  const coverUrl = leadTrack?.coverUrl ?? '';

  const playlist: PlaylistItem = {
    id: `pl-ai-blend-${friend.id}-${Date.now()}`,
    title: `Klyn AI · ${userFirst} × ${friendFirst}`,
    curator: `Klyn AI Blend · ${matchPct}% Match`,
    description: summary,
    trackIds: mergedIds,
    coverUrl,
    pinned: true,
    downloaded: false,
    accentGradient: `linear-gradient(135deg, ${primaryColor}cc 0%, ${friend.accentColor}aa 55%, rgba(16,16,20,0.95) 100%)`,
    displayMode: 'comfortable',
    showQualityBadges: true,
    isAiBlend: true,
    blendMatchPct: matchPct,
    sharedWithFriendId: friend.id,
  };

  return { playlist, matchPct, summary };
}

/**
 * Ranks catalog tracks dynamically based on the user's saved account taste,
 * likes, artist play counts, track play counts, and recent listens.
 */
export function rankCatalogForUser(
  tracks: Track[],
  user: UserAccount | null,
  favoriteIds: Set<string>,
  trackPlayCounts: Record<string, number>,
  artistPlayCounts: Record<string, number>,
  recentLog: ListeningLogEntry[],
): Track[] {
  if (
    !user &&
    favoriteIds.size === 0 &&
    Object.keys(trackPlayCounts).length === 0 &&
    Object.keys(artistPlayCounts).length === 0
  ) {
    return tracks;
  }

  const recentSet = new Set(recentLog.map((e) => e.trackId));
  const preferredGenres = new Set(
    (user?.favoriteGenres ?? []).map((g) => g.toLowerCase()),
  );

  return [...tracks].sort((a, b) => {
    const score = (t: Track) => {
      let s = 0;
      if (favoriteIds.has(t.id)) s += 48;
      s += (trackPlayCounts[t.id] ?? 0) * 10;
      s += (artistPlayCounts[t.artist] ?? 0) * 4;
      if (recentSet.has(t.id)) s += 16;
      if (
        preferredGenres.has(t.genre.toLowerCase()) ||
        preferredGenres.has(t.category.toLowerCase())
      ) {
        s += 34;
      }
      return s;
    };
    const diff = score(b) - score(a);
    return diff !== 0 ? diff : b.plays - a.plays;
  });
}
