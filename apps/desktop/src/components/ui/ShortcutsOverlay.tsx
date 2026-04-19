import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Global shortcuts cheat-sheet. Shown when the user presses `?`.
 * Listens at window level so it works from any route, not just the clip editor.
 */
const SHORTCUTS = [
  {
    category: 'Général',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Ouvrir la palette de commandes' },
      { keys: ['?'], label: 'Afficher ce panneau' },
      { keys: ['Ctrl', 'U'], label: 'Importer une URL' },
      { keys: ['Ctrl', 'O'], label: 'Importer un fichier' },
      { keys: ['Esc'], label: 'Fermer modal' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['G', 'H'], label: "Aller à l'accueil" },
      { keys: ['G', 'A'], label: 'Aller à Analytics' },
      { keys: ['G', 'T'], label: 'Aller aux Templates' },
      { keys: ['G', 'S'], label: 'Aller aux Paramètres' },
    ],
  },
  {
    category: 'Forge',
    items: [
      { keys: ['J'], label: 'Segment suivant' },
      { keys: ['K'], label: 'Segment précédent' },
      { keys: ['E'], label: 'Export TikTok rapide' },
      { keys: ['Space'], label: 'Play / Pause preview' },
      { keys: ['Enter'], label: 'Ouvrir éditeur 9:16' },
    ],
  },
  {
    category: 'Export',
    items: [
      { keys: ['Ctrl', 'G'], label: 'Générer tout (titres/desc/hashtags)' },
      { keys: ['Ctrl', 'P'], label: 'Publier sélection' },
    ],
  },
];

export default function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && target.matches('input, textarea, [contenteditable="true"]');
      if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl w-full max-w-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Raccourcis clavier
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {SHORTCUTS.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    {group.category}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((s) => (
                      <li
                        key={s.label}
                        className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]"
                      >
                        <span className="truncate">{s.label}</span>
                        <div className="flex gap-1 shrink-0">
                          {s.keys.map((k) => (
                            <kbd
                              key={k}
                              className="px-2 py-0.5 text-xs bg-white/10 border border-white/10 rounded font-mono text-[var(--text-primary)]"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="text-xs text-[var(--text-muted)] mt-6 text-center">
              Appuyez sur{' '}
              <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/10 rounded text-xs font-mono">
                ?
              </kbd>{' '}
              pour afficher/masquer
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
