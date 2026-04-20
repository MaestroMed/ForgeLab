import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

interface Hint {
  keys: string[];
  label: string;
}

function getHintsForRoute(pathname: string): Hint[] {
  if (pathname === '/' || pathname === '') {
    return [
      { keys: ['⌘', 'K'], label: 'Commandes' },
      { keys: ['⌘', 'U'], label: 'URL' },
      { keys: ['?'], label: 'Raccourcis' },
    ];
  }
  if (pathname.startsWith('/review/')) {
    return [
      { keys: ['←'], label: 'Skip' },
      { keys: ['→'], label: 'Approuver' },
      { keys: ['Space'], label: 'Play/Pause' },
      { keys: ['Enter'], label: 'Éditer' },
      { keys: ['Esc'], label: 'Sortir' },
    ];
  }
  if (pathname.startsWith('/project/')) {
    return [
      { keys: ['J', 'K'], label: 'Nav segments' },
      { keys: ['E'], label: 'Export TikTok' },
      { keys: ['Space'], label: 'Play/Pause' },
      { keys: ['Enter'], label: 'Éditeur' },
      { keys: ['F11'], label: 'Cinema' },
    ];
  }
  if (pathname.startsWith('/editor/')) {
    return [
      { keys: ['Space'], label: 'Play/Pause' },
      { keys: ['⌘', 'S'], label: 'Sauvegarder' },
      { keys: ['Esc'], label: 'Retour' },
    ];
  }
  return [
    { keys: ['⌘', 'K'], label: 'Commandes' },
    { keys: ['?'], label: 'Raccourcis' },
  ];
}

export default function KeyboardHints() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(true);
  const [hints, setHints] = useState<Hint[]>([]);

  useEffect(() => {
    setHints(getHintsForRoute(pathname));
  }, [pathname]);

  // Auto-hide in cinema mode (toggled via `cinema-mode` class on body).
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVisible(!document.body.classList.contains('cinema-mode'));
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  if (!visible || hints.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="fixed bottom-4 left-4 z-[30] flex items-center gap-3 px-3 py-2 bg-black/60 backdrop-blur-md border border-white/5 rounded-lg text-[10px] text-white/50"
      >
        {hints.map((h, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {h.keys.map((k, ki) => (
                <kbd
                  key={ki}
                  className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/80 font-mono text-[10px] tabular-nums"
                >
                  {k}
                </kbd>
              ))}
            </div>
            <span className="uppercase tracking-wider">{h.label}</span>
          </div>
        ))}
        <button
          onClick={() => setVisible(false)}
          className="ml-1 w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 flex items-center justify-center text-[8px]"
          title="Masquer (? pour tout voir)"
        >
          ×
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
