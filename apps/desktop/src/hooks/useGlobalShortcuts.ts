import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global navigation chord: press `G` then a letter within ~1.2s to jump routes.
 *   G H → home, G A → analytics, G T → templates, G S → settings.
 * Ignored while the user is typing in an input/textarea/contenteditable.
 * Must be used inside a component that lives under `<BrowserRouter>`.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.matches('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }

      // Prime the chord on a bare `G` (no modifiers).
      if (
        e.key.toLowerCase() === 'g' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        gPressed.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => {
          gPressed.current = false;
        }, 1200);
        return;
      }

      if (gPressed.current) {
        const k = e.key.toLowerCase();
        const routes: Record<string, string> = {
          h: '/',
          a: '/analytics',
          t: '/templates',
          s: '/settings',
        };
        if (routes[k]) {
          e.preventDefault();
          navigate(routes[k]);
          gPressed.current = false;
          if (gTimer.current) clearTimeout(gTimer.current);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [navigate]);
}
