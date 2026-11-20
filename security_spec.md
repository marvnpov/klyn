# klyn Security & Access Control Specification

## Security Model
- **Default Deny**: All unspecified collections and documents deny both `read` and `write`.
- **Verified Identity**: Every authenticated action requires `request.auth != null` and `request.auth.token.email_verified == true`.
- **Strict Ownership**: Every document lives under `/users/{userId}/...` where `request.auth.uid == userId`. No user can read, list, create, update, or delete another user's profile, playlists, offline downloads, or friends.
- **No Unbounded Growth**: All strings have explicit `.size()` ceilings, lists (`favoriteGenres`, `likedTrackIds`, `followedArtistIds`, `downloadedTrackIds`, `trackIds`) have explicit `.size()` bounds, and playlists/downloads/friends live in dedicated subcollections.
- **Immutable Identity & Timestamps**:
  - `uid` / `ownerId` and `createdAt` cannot be forged or altered after creation.
  - `createdAt`, `updatedAt`, and `downloadedAt` must equal `request.time` on write.

## Collection Access Matrix
| Path | `get` / `list` | `create` | `update` | `delete` |
|---|---|---|---|---|
| `/users/{userId}` | Owner (`isOwner(userId)`) | Owner + strict schema (`hasAll`, `hasOnly`, `uid == userId`, `createdAt == request.time`, `updatedAt == request.time`) | Owner + `affectedKeys().hasOnly(...)` + immutable `uid`/`createdAt` + `updatedAt == request.time` | Owner (`isOwner(userId)`) |
| `/users/{userId}/playlists/{playlistId}` | Owner | Owner + strict schema (`id == playlistId`, `ownerId == userId`) | Owner + `affectedKeys().hasOnly(...)` + immutable `id`/`ownerId`/`createdAt` | Owner |
| `/users/{userId}/downloads/{trackId}` | Owner | Owner + strict schema (`id == trackId`, `ownerId == userId`, `downloadedAt == request.time`) | Owner + `affectedKeys().hasOnly(...)` + immutable `id`/`ownerId` | Owner |
| `/users/{userId}/friends/{friendId}` | Owner | Owner + strict schema (`id == friendId`, `ownerId == userId`) | Owner + `affectedKeys().hasOnly(...)` + immutable `id`/`ownerId`/`createdAt` | Owner |
| `/{document=**}` | Deny | Deny | Deny | Deny |
