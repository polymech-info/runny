/** Shared in-memory drag state for favourites DnD (custom MIME types are unreliable in dragover.types). */

export type FavouriteDragPayload =
  | { kind: "script"; scriptId: string; /** Empty when dragging from outside favourites (e.g. Recent). */ fromGroupId: string }
  | { kind: "group"; groupId: string };

export let activeFavouriteDrag: FavouriteDragPayload | null = null;

export function setActiveFavouriteDrag(payload: FavouriteDragPayload | null) {
  activeFavouriteDrag = payload;
}
