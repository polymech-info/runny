/** Shared in-memory drag state for favourites DnD (custom MIME types are unreliable in dragover.types). */

export type FavouriteDragPayload =
  | { kind: "script"; scriptId: string; /** Empty when dragging from outside favourites (e.g. Recent). */ fromGroupId: string }
  | { kind: "group"; groupId: string };

export let activeFavouriteDrag: FavouriteDragPayload | null = null;

export function setActiveFavouriteDrag(payload: FavouriteDragPayload | null) {
  activeFavouriteDrag = payload;
}

/** Tree, group, and pipe-segment drags. dragover cannot read dataTransfer. */
export type PipeDragPayload = {
  scriptIds: string[];
  /** `releaseId:facetId` when the drag started on a pipe segment. */
  fromFacet?: string;
};

export let activePipeDrag: PipeDragPayload | null = null;

export function setActivePipeDrag(payload: PipeDragPayload | null) {
  activePipeDrag = payload;
}

export function beginScriptDrag(
  dataTransfer: DataTransfer,
  scriptIds: string[],
  fromFacet?: string,
  linkFavourites = true
) {
  setActivePipeDrag({ scriptIds, fromFacet });
  if (linkFavourites && scriptIds.length === 1) {
    setActiveFavouriteDrag({
      kind: "script",
      scriptId: scriptIds[0],
      fromGroupId: fromFacet ? `pipe:${fromFacet}` : "",
    });
  } else {
    setActiveFavouriteDrag(null);
  }
  dataTransfer.setData("text/plain", scriptIds.join("\n"));
  dataTransfer.effectAllowed = fromFacet ? "move" : "copy";
}

export function endScriptDrag() {
  setActivePipeDrag(null);
  setActiveFavouriteDrag(null);
}
