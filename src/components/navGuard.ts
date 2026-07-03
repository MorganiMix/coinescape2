/**
 * Lightweight navigation leave-guard.
 *
 * A screen (currently Settings) can register a guard that must approve leaving
 * before NavMenu performs a route change. The guard receives a `proceed`
 * callback to run the pending navigation once the user has resolved any prompt
 * (e.g. "save your changes?"). Returning `true` means "I'm handling this —
 * don't navigate yet"; returning `false`/registering no guard lets navigation
 * happen immediately.
 *
 * Module-level (not context) so NavMenu — which is rendered on every screen —
 * can consult it without threading a provider through the tree.
 */
export type LeaveGuard = (proceed: () => void) => boolean;

let currentGuard: LeaveGuard | null = null;

/** Register the active screen's leave-guard. Returns an unregister function. */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  currentGuard = guard;
  return () => {
    if (currentGuard === guard) currentGuard = null;
  };
}

/**
 * Ask the active guard (if any) whether navigation may proceed.
 * @param proceed runs the actual navigation.
 * @returns true if the guard intercepted (navigation deferred), false if the
 *          caller should navigate now.
 */
export function requestLeave(proceed: () => void): boolean {
  if (!currentGuard) return false;
  return currentGuard(proceed);
}
