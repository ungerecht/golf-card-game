import type { AvatarId } from "@golf/shared";
import { AVATAR_LABELS, avatarUrl } from "@/lib/avatars";
import "./Avatar.css";

/** A portrait. The art is 64x64, drawn at a whole number of art pixels per pixel. */
export function Avatar({ id, grey = false }: { id: AvatarId; grey?: boolean }) {
  return (
    <img
      className={grey ? "avatar grey" : "avatar"}
      src={avatarUrl(id)}
      alt={AVATAR_LABELS[id]}
      width={64}
      height={64}
      decoding="sync"
      draggable={false}
    />
  );
}
