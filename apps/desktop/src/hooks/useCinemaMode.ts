import { useEffect, useState, useCallback } from 'react';

export function useCinemaMode() {
  const [cinemaMode, setCinemaMode] = useState(false);

  const enter = useCallback(() => {
    setCinemaMode(true);
    document.body.classList.add('cinema-mode');
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    setCinemaMode(false);
    document.body.classList.remove('cinema-mode');
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    if (cinemaMode) exit();
    else enter();
  }, [cinemaMode, enter, exit]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // F11 or Cmd+Shift+F
      if (e.key === 'F11' || (e.key === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey)) {
        e.preventDefault();
        toggle();
      }
      // Escape exits
      if (e.key === 'Escape' && cinemaMode) {
        exit();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggle, exit, cinemaMode]);

  // Handle browser-triggered fullscreen exit
  useEffect(() => {
    const h = () => {
      if (!document.fullscreenElement && cinemaMode) {
        setCinemaMode(false);
        document.body.classList.remove('cinema-mode');
      }
    };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, [cinemaMode]);

  return { cinemaMode, enter, exit, toggle };
}
