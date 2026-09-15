import { WallSavedScreen } from "@/components/wall/wall-saved-screen";

/**
 * This person's own Saved view (#84), reached from the Wall's header. A
 * sibling of `wall/[id]` rather than a segment under it, and it takes no
 * params — there is exactly one Saved view, and it is always the signed-in
 * caller's own.
 */
export default function WallSavedRouteScreen() {
  return <WallSavedScreen />;
}
