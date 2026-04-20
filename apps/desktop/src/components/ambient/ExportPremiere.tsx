import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';
import { X, Send, FolderOpen, Sparkles } from 'lucide-react';
import { ENGINE_BASE_URL } from '@/lib/config';
import { celebrate } from './Celebration';
import { sfxViral } from '@/lib/sfx';

interface PremiereArtifact {
  id: string;
  projectId: string;
  filename: string;
  /** Absolute file path on disk, used by the "Open folder" button. */
  filePath?: string;
  score?: number;
  duration?: number;
  segmentId?: string;
}

interface PremiereState {
  artifact: PremiereArtifact | null;
  show: (artifact: PremiereArtifact) => void;
  close: () => void;
}

export const usePremiereStore = create<PremiereState>((set) => ({
  artifact: null,
  show: (artifact) => set({ artifact }),
  close: () => set({ artifact: null }),
}));

/** Imperative helper for callers who don't want to touch the store directly. */
export function showPremiere(artifact: PremiereArtifact) {
  usePremiereStore.getState().show(artifact);
}

export default function ExportPremiere() {
  const artifact = usePremiereStore((s) => s.artifact);
  const close = usePremiereStore((s) => s.close);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!artifact) {
      setScoreRevealed(false);
      return;
    }

    // Small pause before the celebration so the 9:16 video has time to pop in
    // and the viewer's eye has landed on the stage.
    const timer = setTimeout(() => {
      celebrate('bigwin', window.innerWidth / 2, window.innerHeight / 2);
      sfxViral();
      setScoreRevealed(true);
    }, 600);

    return () => clearTimeout(timer);
  }, [artifact]);

  useEffect(() => {
    if (!artifact) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [artifact, close]);

  if (!artifact) return null;

  const videoUrl = `${ENGINE_BASE_URL}/v1/projects/${artifact.projectId}/artifacts/${artifact.id}/file`;
  const score = artifact.score ?? 0;
  const scoreColor =
    score >= 90 ? '#EF4444' : score >= 80 ? '#F59E0B' : score >= 70 ? '#22C55E' : '#3B82F6';

  const handlePublish = () => {
    // Dispatch a custom event so whichever panel has the publish modal mounted
    // can react and open it pre-filled for this artifact.
    window.dispatchEvent(
      new CustomEvent('forge:open-publish', { detail: artifact }),
    );
    close();
  };

  const handleOpenFolder = () => {
    // Prefer the absolute path on disk (needed by showItem); fall back to the
    // filename if that's all we have.
    const target = artifact.filePath || artifact.filename;
    if (target && window.forge?.showItem) {
      window.forge.showItem(target);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="premiere"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[250] bg-black flex items-center justify-center"
      >
        {/* Radial backdrop — subtle glow behind the stage */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(245,158,11,0.08), transparent 60%)',
          }}
        />

        {/* Top label */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="absolute top-8 inset-x-0 text-center"
        >
          <div className="text-xs text-white/40 uppercase tracking-[0.3em] mb-2">
            Clip exporté
          </div>
          <div className="flex items-center justify-center gap-2 text-viral-medium">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold">Prêt à publier</span>
            <Sparkles className="w-4 h-4" />
          </div>
        </motion.div>

        {/* Close button */}
        <button
          onClick={close}
          aria-label="Fermer"
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Main stage */}
        <div className="relative flex items-center gap-16">
          {/* 9:16 video */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.2 }}
            className="relative"
            style={{ width: 360, height: 640 }}
          >
            <div
              className="absolute inset-0 rounded-3xl overflow-hidden"
              style={{
                boxShadow: `0 0 120px ${scoreColor}40, 0 40px 80px rgba(0,0,0,0.8)`,
                border: `2px solid ${scoreColor}40`,
              }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                controls={false}
                playsInline
              />
            </div>

            {/* Score badge animated */}
            {scoreRevealed && score > 0 && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full flex flex-col items-center justify-center"
                style={{
                  background: `radial-gradient(circle, ${scoreColor}, ${scoreColor}60)`,
                  boxShadow: `0 0 40px ${scoreColor}`,
                }}
              >
                <div className="text-[9px] uppercase tracking-wider text-white/80">
                  Score
                </div>
                <div className="text-3xl font-bold text-white tabular-nums leading-none">
                  {Math.round(score)}
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Side panel: info + actions */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="w-80"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2">
              Statut
            </div>
            <h2 className="text-4xl font-bold mb-2 text-white leading-tight">
              Exporté
            </h2>
            <p className="text-white/60 text-sm mb-8">
              Ton clip est prêt.{' '}
              {score > 0 ? (
                <>
                  Score de viralité{' '}
                  <span style={{ color: scoreColor }} className="font-bold">
                    {Math.round(score)}/100
                  </span>
                  {score >= 85 && ' — très prometteur.'}
                  {score >= 75 && score < 85 && ' — solide.'}
                </>
              ) : (
                'Lance-le sur les réseaux quand tu veux.'
              )}
            </p>

            <div className="space-y-3">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                onClick={handlePublish}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-viral-medium to-viral-high text-black font-bold flex items-center justify-center gap-2 shadow-lg shadow-viral-medium/30 hover:scale-[1.02] transition-transform"
              >
                <Send className="w-5 h-5" />
                Publier maintenant
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                onClick={handleOpenFolder}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Ouvrir le dossier
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                onClick={close}
                className="w-full py-2.5 text-white/40 hover:text-white/70 text-xs transition-colors"
              >
                Plus tard
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Bottom hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-6 inset-x-0 text-center text-[10px] text-white/30"
        >
          <kbd className="px-1.5 py-0.5 bg-white/5 rounded">Esc</kbd> pour fermer
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
