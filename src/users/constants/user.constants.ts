export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const AVATAR_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AvatarAllowedMime = (typeof AVATAR_ALLOWED_MIMES)[number];

export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const ATTACHABLE_TYPES = {
  USER_AVATAR: 'UserAvatar',
} as const;

export const USER_FIELD_LIMITS = {
  FULL_NAME_MAX_LENGTH: 255,
  BIO_MAX_LENGTH: 1000,
} as const;
