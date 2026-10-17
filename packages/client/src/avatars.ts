import { AVATAR_IDS, type AvatarId } from "@golf/shared";

// Every portrait in the avatars folder, keyed by its path.
const portraits = import.meta.glob<string>("./assets/avatars/*/portrait.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** The portrait image for an avatar id. */
export function avatarUrl(id: AvatarId): string {
  const url = portraits[`./assets/avatars/${id}/portrait.png`];
  if (url === undefined) throw new Error(`Missing portrait for avatar "${id}"`);
  return url;
}

/** Human-friendly names, for alt text and tooltips. */
export const AVATAR_LABELS: Record<AvatarId, string> = {
  visor: "Visor",
  teal: "Teal",
  lavender: "Lavender",
  bucket: "Bucket hat",
  chip: "Chip",
  ginger: "Ginger",
};

export { AVATAR_IDS };
