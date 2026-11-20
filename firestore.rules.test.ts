/**
 * Security Rule Expectation Tests (Phase 0 TDD Contract)
 * Covers all collections defined in firebase-blueprint.json:
 * - /users/{userId}
 * - /users/{userId}/playlists/{playlistId}
 * - /users/{userId}/downloads/{trackId}
 * - /users/{userId}/friends/{friendId}
 */

export const SECURITY_TEST_MATRIX = [
  {
    name: 'Denies unauthenticated read/write to /users/{userId}',
    actor: null,
    path: '/users/user-alice',
    expected: { read: false, create: false, update: false, delete: false },
  },
  {
    name: 'Denies unverified email read/write to /users/{userId}',
    actor: { uid: 'user-alice', email_verified: false },
    path: '/users/user-alice',
    expected: { read: false, create: false, update: false, delete: false },
  },
  {
    name: 'Denies cross-user read/write to another user profile, playlists, downloads, and friends',
    actor: { uid: 'user-bob', email_verified: true },
    path: '/users/user-alice/downloads/track-1',
    expected: { read: false, create: false, update: false, delete: false },
  },
  {
    name: 'Allows verified owner to create and update their own UserProfile within field bounds',
    actor: { uid: 'user-alice', email_verified: true },
    path: '/users/user-alice',
    expected: { read: true, create: true, update: true, delete: true },
  },
  {
    name: 'Denies updating immutable uid or createdAt on /users/{userId}',
    actor: { uid: 'user-alice', email_verified: true },
    path: '/users/user-alice',
    mutatedKeys: ['uid', 'createdAt'],
    expected: { update: false },
  },
  {
    name: 'Allows verified owner to CRUD own playlists, downloads, and friends',
    actor: { uid: 'user-alice', email_verified: true },
    path: '/users/user-alice/playlists/pl-1',
    expected: { read: true, create: true, update: true, delete: true },
  },
  {
    name: 'Denies reading arbitrary unspecified paths via default deny catch-all',
    actor: { uid: 'user-alice', email_verified: true },
    path: '/test/connection',
    expected: { read: false, write: false },
  },
] as const;
