/**
 * Thin wrapper around the native View Transitions API (Chromium 111+).
 *
 * When supported, `document.startViewTransition` takes a snapshot of the
 * current DOM, runs the callback (which mutates the DOM), then smoothly
 * crossfades/animates between the old and new states using the
 * `::view-transition-*` pseudo-elements styled in globals.css.
 *
 * On browsers without support the callback runs synchronously — no fallback
 * animation is attempted here so callers don't end up with two competing
 * transition systems running at once.
 */

type ViewTransitionCallback = () => void | Promise<void>;

interface ViewTransitionLike {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}

type DocumentWithVT = Document & {
  startViewTransition?: (cb: ViewTransitionCallback) => ViewTransitionLike;
};

export function supportsViewTransitions(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as DocumentWithVT).startViewTransition === 'function'
  );
}

export function startViewTransition(callback: ViewTransitionCallback): void {
  const doc = document as DocumentWithVT;
  if (typeof doc.startViewTransition === 'function') {
    try {
      doc.startViewTransition(callback);
      return;
    } catch {
      // If the browser ships the API but rejects the call (e.g. because a
      // transition is already in flight), fall back to running the callback
      // directly so navigation still happens.
    }
  }
  void callback();
}
