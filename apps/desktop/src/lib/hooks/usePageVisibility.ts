import { useEffect, useState } from 'react';

/**
 * Shared page-visibility observer.
 *
 * Keeps a single `visibilitychange` listener for the whole app and fans out
 * the resulting boolean to every subscribed component. Useful to pause
 * polling hooks when the tab is hidden (React Query already supports
 * `refetchIntervalInBackground: false` for this, but `enabled` gated by
 * visibility can also suspend queries that don't poll).
 */

let cached = typeof document !== 'undefined' ? !document.hidden : true;
const listeners = new Set<(visible: boolean) => void>();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    cached = !document.hidden;
    listeners.forEach((l) => l(cached));
  });
}

export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(cached);
  useEffect(() => {
    listeners.add(setVisible);
    // Sync in case visibility changed between mount and effect
    setVisible(cached);
    return () => {
      listeners.delete(setVisible);
    };
  }, []);
  return visible;
}
