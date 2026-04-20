/**
 * Segment Comparison Modal (A/B)
 *
 * Side-by-side comparison of two segments with synchronized play/pause
 * controls. Feeds both <video> elements from the project proxy and uses
 * the ``#t=start,end`` media fragment syntax so each frame stays scoped
 * to its segment window.
 */

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { mediaUrl } from '@/lib/config';

interface Segment {
  id: string;
  start_time?: number;
  startTime?: number;
  end_time?: number;
  endTime?: number;
  duration: number;
  score?: { total?: number } | number;
  scoreTotal?: number;
  transcript?: string | { text?: string };
  topicLabel?: string;
}

interface Props {
  projectId: string;
  segmentA: Segment;
  segmentB: Segment;
  onClose: () => void;
}

function getStart(seg: Segment): number {
  return seg.start_time ?? seg.startTime ?? 0;
}

function getScore(seg: Segment): number {
  if (typeof seg.scoreTotal === 'number') return seg.scoreTotal;
  if (typeof seg.score === 'number') return seg.score;
  if (seg.score && typeof seg.score === 'object' && typeof seg.score.total === 'number') {
    return seg.score.total;
  }
  return 0;
}

function getTranscript(seg: Segment): string {
  if (typeof seg.transcript === 'string') return seg.transcript;
  if (seg.transcript && typeof seg.transcript === 'object') {
    return seg.transcript.text ?? '';
  }
  return '';
}

export default function SegmentComparisonModal({
  projectId,
  segmentA,
  segmentB,
  onClose,
}: Props) {
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);

  const getVideoUrl = (seg: Segment): string => {
    const start = getStart(seg);
    // Browsers honour `#t=start,end` media fragments; using the proxy keeps
    // seeking fast and avoids exposing the raw source path.
    return `${mediaUrl(projectId, 'proxy')}#t=${start},${start + seg.duration}`;
  };

  const playBoth = () => {
    const a = videoRefA.current;
    const b = videoRefB.current;
    if (a) {
      a.currentTime = getStart(segmentA);
      void a.play();
    }
    if (b) {
      b.currentTime = getStart(segmentB);
      void b.play();
    }
  };

  const pauseBoth = () => {
    videoRefA.current?.pause();
    videoRefB.current?.pause();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl w-full max-w-6xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Comparaison A/B</h2>
            <div className="flex gap-2">
              <button
                onClick={playBoth}
                className="px-3 py-1.5 bg-viral-medium/10 text-viral-medium border border-viral-medium/20 rounded text-sm"
              >
                ▶ Lecture simultanée
              </button>
              <button
                onClick={pauseBoth}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm"
              >
                ⏸ Pause
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/5 rounded"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { seg: segmentA, ref: videoRefA, label: 'A' },
              { seg: segmentB, ref: videoRefB, label: 'B' },
            ].map(({ seg, ref, label }) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-viral-medium/10 text-viral-medium rounded text-sm font-bold">
                    {label}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">
                    Score {Math.round(getScore(seg))} · {Math.round(seg.duration)}s
                  </span>
                  {seg.topicLabel && (
                    <span className="text-xs text-[var(--text-muted)] truncate">
                      {seg.topicLabel}
                    </span>
                  )}
                </div>
                <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  <video
                    ref={ref}
                    src={getVideoUrl(seg)}
                    className="w-full h-full object-cover"
                    controls
                    muted
                    preload="metadata"
                  />
                </div>
                <div className="text-xs text-[var(--text-muted)] line-clamp-3 bg-white/5 p-2 rounded">
                  {getTranscript(seg) || <span className="italic">Pas de transcript disponible</span>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
