import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Home,
  BarChart3,
  LayoutTemplate,
  Settings,
  Upload,
  Link2,
  History as HistoryIcon,
  Zap,
  Film,
} from 'lucide-react';
import { useProjectsStore } from '@/store';

type Category = 'navigation' | 'action' | 'project';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void | Promise<void>;
  keywords?: string[];
  category: Category;
}

const CATEGORY_LABELS: Record<Category, string> = {
  navigation: 'Navigation',
  action: 'Actions',
  project: 'Projets récents',
};

/**
 * Raycast-style command palette. Opens with Ctrl/Cmd+K.
 * Fuzzy-ish substring search across navigation, actions, and recent projects.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const navigate = useNavigate();
  const recentProjects = useProjectsStore((s) => s.projects);

  const commands: Command[] = useMemo(() => {
    const base: Command[] = [
      {
        id: 'nav-home',
        label: "Aller à l'accueil",
        icon: Home,
        action: () => navigate('/'),
        category: 'navigation',
        keywords: ['home', 'projets', 'accueil'],
      },
      {
        id: 'nav-analytics',
        label: 'Aller à Analytics',
        icon: BarChart3,
        action: () => navigate('/analytics'),
        category: 'navigation',
        keywords: ['stats', 'metriques', 'analytics'],
      },
      {
        id: 'nav-templates',
        label: 'Aller aux Templates',
        icon: LayoutTemplate,
        action: () => navigate('/templates'),
        category: 'navigation',
        keywords: ['style', 'templates'],
      },
      {
        id: 'nav-history',
        label: 'Historique des clips',
        icon: HistoryIcon,
        action: () => navigate('/history'),
        category: 'navigation',
        keywords: ['archive', 'exports', 'history', 'historique'],
      },
      {
        id: 'nav-settings',
        label: 'Paramètres',
        icon: Settings,
        action: () => navigate('/settings'),
        category: 'navigation',
        keywords: ['config', 'reglages', 'settings'],
      },
      {
        id: 'action-new',
        label: 'Nouveau projet (importer fichier)',
        icon: Upload,
        action: async () => {
          navigate('/');
          if (window.forge) {
            const filePath = await window.forge.openFile();
            if (filePath) {
              window.dispatchEvent(
                new CustomEvent('forge:import-file', { detail: { filePath } }),
              );
            }
          }
        },
        category: 'action',
        keywords: ['import', 'fichier', 'video', 'new', 'create'],
      },
      {
        id: 'action-url',
        label: 'Importer depuis URL',
        icon: Link2,
        action: () => {
          navigate('/');
          // Give the navigation a tick so HomePage is mounted before dispatch.
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('forge:open-url-import'));
          }, 0);
        },
        category: 'action',
        keywords: ['youtube', 'twitch', 'url', 'download'],
      },
      {
        id: 'action-shortcuts',
        label: 'Afficher les raccourcis clavier',
        icon: Zap,
        action: () => {
          // Dispatch synthesized ? press that ShortcutsOverlay listens for.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
        },
        category: 'action',
        keywords: ['help', 'raccourcis', 'keyboard', 'shortcuts'],
      },
    ];

    const recents: Command[] = recentProjects.slice(0, 5).map((p) => ({
      id: `project-${p.id}`,
      label: p.name,
      description: p.status,
      icon: Film,
      action: () => navigate(`/project/${p.id}`),
      category: 'project',
      keywords: [p.name, p.status],
    }));

    return [...base, ...recents];
  }, [navigate, recentProjects]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => {
      const haystack = [c.label, c.description ?? '', ...(c.keywords || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  // Reset the selection whenever the filtered list shrinks below the cursor.
  useEffect(() => {
    if (selectedIdx >= filteredCommands.length) {
      setSelectedIdx(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands, selectedIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Global toggle: Ctrl+K / Cmd+K.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setQuery('');
            setSelectedIdx(0);
          }
          return next;
        });
        return;
      }

      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIdx];
        if (cmd) {
          void cmd.action();
          setOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filteredCommands, selectedIdx]);

  // Group filtered commands by category while preserving insertion order.
  const grouped = useMemo(() => {
    const map = new Map<Category, Command[]>();
    for (const cmd of filteredCommands) {
      const arr = map.get(cmd.category) ?? [];
      arr.push(cmd);
      map.set(cmd.category, arr);
    }
    return Array.from(map.entries());
  }, [filteredCommands]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-[15vh] p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 p-3 border-b border-white/5">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                placeholder="Rechercher une action, un projet..."
                className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-[var(--text-muted)]">
                ESC
              </kbd>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {filteredCommands.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                  Aucune commande trouvée.
                </p>
              ) : (
                grouped.map(([cat, cmds]) => (
                  <div key={cat}>
                    <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </div>
                    {cmds.map((cmd) => {
                      const globalIdx = filteredCommands.indexOf(cmd);
                      const isSelected = globalIdx === selectedIdx;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => {
                            void cmd.action();
                            setOpen(false);
                          }}
                          onMouseEnter={() => setSelectedIdx(globalIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? 'bg-viral-medium/10 border-l-2 border-viral-medium'
                              : 'border-l-2 border-transparent hover:bg-white/5'
                          }`}
                        >
                          <Icon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                          <span className="flex-1 truncate text-[var(--text-primary)]">
                            {cmd.label}
                          </span>
                          {cmd.description && (
                            <span className="text-xs text-[var(--text-muted)] truncate max-w-[180px]">
                              {cmd.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-white/5 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10">
                  &uarr;&darr;
                </kbd>{' '}
                naviguer
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10">
                  &#x21B5;
                </kbd>{' '}
                sélectionner
              </span>
              <span className="ml-auto flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/5 rounded border border-white/10">
                  Ctrl+K
                </kbd>{' '}
                ouvrir/fermer
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
