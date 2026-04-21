import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Remembers scroll position per route history entry and restores on back/forward.
 * Scrolls to top on new navigations.
 */
export default function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const previousKey = useRef<string>(location.key);

  // Capture scroll position before leaving
  useEffect(() => {
    const save = () => {
      scrollPositions.current.set(previousKey.current, window.scrollY);
    };
    window.addEventListener('beforeunload', save);
    return () => {
      save();
      window.removeEventListener('beforeunload', save);
    };
  });

  useLayoutEffect(() => {
    // Save the previous location's scroll
    if (previousKey.current !== location.key) {
      scrollPositions.current.set(previousKey.current, window.scrollY);
    }

    if (navigationType === 'POP') {
      // Back/forward: restore saved scroll
      const saved = scrollPositions.current.get(location.key);
      if (saved !== undefined) {
        window.scrollTo(0, saved);
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      // New navigation: scroll to top
      window.scrollTo(0, 0);
    }

    previousKey.current = location.key;
  }, [location.key, navigationType]);

  return null;
}
