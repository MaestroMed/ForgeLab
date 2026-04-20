import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Check, Edit, Rocket } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENGINE_BASE_URL } from '@/lib/config';
import { useToastStore } from '@/store';
import { useRocketStore } from '@/components/ambient/RocketLaunch';
import { celebrate } from '@/components/ambient/Celebration';
import { sfxApprove, sfxReject, sfxRocket } from '@/lib/sfx';

export default function ReviewModePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const [idx, setIdx] = useState(0);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: segmentsData } = useQuery({
    queryKey: ['review-segments', projectId],
    queryFn: () => api.listSegments(projectId!, { sortBy: 'score', pageSize: 100 }),
    enabled: !!projectId,
  });

  const segments = (segmentsData as any)?.data?.data?.items ?? (segmentsData as any)?.data?.items ?? [];
  const current = segments[idx];
  const done = idx >= segments.length && segments.length > 0;
  const doneCelebrationFiredRef = useRef(false);

  useEffect(() => {
    if (done && !doneCelebrationFiredRef.current) {
      doneCelebrationFiredRef.current = true;
      celebrate('bigwin');
    }
  }, [done]);

  const advance = useCallback((direction: 'left' | 'right') => {
    if (!current) return;
    setSwipeDirection(direction);
    if (direction === 'right') {
      setApprovedIds((prev) => [...prev, current.id]);
      // Approval feels like a launch — fire a rocket from the card center.
      useRocketStore.getState().fire(
        window.innerWidth / 2,
        window.innerHeight / 2,
        '🚀 Approuvé',
      );
      sfxApprove();
      celebrate('approve', window.innerWidth / 2, window.innerHeight / 2);
    } else {
      setSkippedIds((prev) => [...prev, current.id]);
      sfxReject();
    }
    setTimeout(() => {
      setIdx((i) => i + 1);
      setSwipeDirection(null);
    }, 450);
  }, [current]);

  const triggerExport = useCallback(async (segmentId: string) => {
    try {
      await api.exportSegment(projectId!, {
        segmentId,
        platform: 'tiktok',
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: true,
      });
      addToast({ type: 'success', title: '🚀 En route', message: 'Export TikTok démarré.' });
    } catch {
      addToast({ type: 'error', title: 'Échec', message: 'Export non lancé.' });
    }
  }, [projectId, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === 'ArrowRight') advance('right');
      else if (e.key === 'ArrowLeft') advance('left');
      else if (e.key === 'Enter' && current) {
        navigate(`/editor/${projectId}?segment=${current.id}`);
      } else if (e.key === 'Escape') {
        navigate(`/project/${projectId}`);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
          } else {
            videoRef.current.pause();
          }
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advance, current, navigate, projectId, done]);

  // Auto-export approved ones at the end
  const finishAndExportAll = async () => {
    if (approvedIds.length === 0) {
      navigate(`/project/${projectId}`);
      return;
    }
    addToast({ type: 'info', title: 'Export batch', message: `${approvedIds.length} clips en queue.` });
    // Fire a celebratory rocket per clip, staggered, before the API calls.
    approvedIds.forEach((_, i) => {
      setTimeout(() => {
        useRocketStore.getState().fire(
          window.innerWidth / 2 + (Math.random() - 0.5) * 120,
          window.innerHeight - 80,
          `🚀 #${i + 1}`,
        );
        sfxRocket();
      }, i * 120);
    });
    for (const id of approvedIds) {
      triggerExport(id).catch(() => {});
    }
    navigate(`/project/${projectId}?tab=export`);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <div className="text-6xl mb-6">🎬</div>
          <h1 className="text-3xl font-bold mb-2">Review terminée</h1>
          <p className="text-white/60 mb-8">{segments.length} segments passés en revue</p>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="text-4xl font-bold text-green-400">{approvedIds.length}</div>
              <div className="text-xs text-white/60 mt-1">Approuvés</div>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-4xl font-bold text-white/40">{skippedIds.length}</div>
              <div className="text-xs text-white/60 mt-1">Skippés</div>
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            <button onClick={() => navigate(`/project/${projectId}`)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">
              Retour projet
            </button>
            {approvedIds.length > 0 && (
              <button onClick={finishAndExportAll} className="px-4 py-2 rounded-lg bg-viral-medium text-black text-sm font-semibold flex items-center gap-2">
                <Rocket className="w-4 h-4" /> Exporter les {approvedIds.length}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/40">
        Chargement des segments…
      </div>
    );
  }

  const scoreTotal = current.score?.total ?? current.scoreTotal ?? current.score_total ?? 0;
  const startTime = current.startTime ?? current.start_time ?? 0;
  const endTime = current.endTime ?? current.end_time ?? 0;
  const videoUrl = `${ENGINE_BASE_URL}/v1/projects/${projectId}/media/proxy#t=${startTime},${endTime}`;
  const transcript = typeof current.transcript === 'string' ? current.transcript : current.transcript?.text ?? '';
  const scoreColor = scoreTotal >= 90 ? '#EF4444' : scoreTotal >= 80 ? '#F59E0B' : scoreTotal >= 70 ? '#22C55E' : '#3B82F6';

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* Progress bar top */}
      <div className="absolute top-0 inset-x-0 h-1 bg-white/5 z-30">
        <motion.div
          className="h-full bg-viral-medium"
          initial={{ width: 0 }}
          animate={{ width: `${((idx + 1) / segments.length) * 100}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-4 inset-x-0 flex items-center justify-between px-6 z-20 text-white">
        <button onClick={() => navigate(`/project/${projectId}`)} className="p-2 hover:bg-white/5 rounded-lg">
          <X className="w-5 h-5" />
        </button>
        <div className="text-sm text-white/60">
          {idx + 1} / {segments.length}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span>Approuvés: <span className="text-green-400 font-bold">{approvedIds.length}</span></span>
        </div>
      </div>

      {/* Card stack */}
      <AnimatePresence>
        <motion.div
          key={current.id}
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{
            scale: swipeDirection ? 0.85 : 1,
            opacity: swipeDirection ? 0 : 1,
            x: swipeDirection === 'right' ? 400 : swipeDirection === 'left' ? -400 : 0,
            rotate: swipeDirection === 'right' ? 15 : swipeDirection === 'left' ? -15 : 0,
          }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          drag={!swipeDirection ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_, info: PanInfo) => {
            if (info.offset.x > 120) advance('right');
            else if (info.offset.x < -120) advance('left');
          }}
          className="relative w-[360px] h-[640px] rounded-2xl overflow-hidden shadow-2xl bg-black cursor-grab active:cursor-grabbing"
          style={{ border: `2px solid ${scoreColor}40` }}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />

          {/* Score badge */}
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-md"
            style={{ backgroundColor: `${scoreColor}30`, border: `1px solid ${scoreColor}`, color: scoreColor }}
          >
            {Math.round(scoreTotal)}
          </div>

          {/* Bottom transcript + actions */}
          <div className="absolute bottom-0 inset-x-0 p-4 pt-10 bg-gradient-to-t from-black via-black/80 to-transparent text-white">
            <p className="text-xs italic text-white/80 line-clamp-3">
              {transcript ? `"${transcript.slice(0, 160)}"` : 'Pas de transcript'}
            </p>
            <div className="mt-3 flex items-center justify-between text-[10px] text-white/40 tabular-nums">
              <span>{(endTime - startTime).toFixed(0)}s</span>
              <span>segment #{current.id.slice(0, 6)}</span>
            </div>
          </div>

          {/* Swipe hints overlay */}
          <div className="absolute inset-y-0 left-0 w-1/3 pointer-events-none">
            {/* indicator visible on drag */}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Bottom action buttons */}
      <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6 z-20">
        <button
          onClick={() => advance('left')}
          className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500 text-red-400 flex items-center justify-center hover:scale-110 transition-transform"
          title="Skip (←)"
        >
          <X className="w-6 h-6" />
        </button>
        <button
          onClick={() => navigate(`/editor/${projectId}?segment=${current.id}`)}
          className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-white/70 flex items-center justify-center hover:scale-110 transition-transform"
          title="Edit (Enter)"
        >
          <Edit className="w-5 h-5" />
        </button>
        <button
          onClick={() => advance('right')}
          className="w-14 h-14 rounded-full bg-green-500/20 border-2 border-green-500 text-green-400 flex items-center justify-center hover:scale-110 transition-transform"
          title="Approuver (→)"
        >
          <Check className="w-6 h-6" />
        </button>
      </div>

      {/* Keyboard hints bottom */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[10px] text-white/30 z-10">
        <span><kbd className="px-1 bg-white/5 rounded">←</kbd> skip</span>
        <span><kbd className="px-1 bg-white/5 rounded">→</kbd> approuver</span>
        <span><kbd className="px-1 bg-white/5 rounded">Enter</kbd> éditer</span>
        <span><kbd className="px-1 bg-white/5 rounded">Esc</kbd> sortir</span>
      </div>
    </div>
  );
}
