import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Settings, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isSfxEnabled, setSfxEnabled } from '@/lib/sfx';

/**
 * Right-edge slide-in drawer exposing the most-used settings (sound, shortcut
 * to full settings page). Toggled with Cmd/Ctrl + , .
 */
export default function QuickSettings() {
  const [open, setOpen] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setSfxOn(isSfxEnabled());
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxEnabled(next);
    setSfxOn(next);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 250 }}
            className="fixed top-0 right-0 bottom-0 w-80 bg-[#0F0F15] border-l border-white/10 z-[91] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div>
                <h2 className="font-bold">Paramètres rapides</h2>
                <p className="text-[10px] text-white/40 mt-0.5">⌘, pour ouvrir/fermer</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/5"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Sound */}
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Son</h3>
                <button
                  onClick={toggleSfx}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {sfxOn ? (
                      <Volume2 className="w-4 h-4 text-viral-medium" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-white/40" />
                    )}
                    <span className="text-sm">Effets sonores</span>
                  </div>
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${
                      sfxOn ? 'bg-viral-medium' : 'bg-white/10'
                    } relative`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        sfxOn ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              </div>

              {/* Link to full settings */}
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span>Tous les paramètres</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
