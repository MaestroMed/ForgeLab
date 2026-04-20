import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { celebrate } from '@/components/ambient/Celebration';
import { sfxViral } from '@/lib/sfx';

interface SpineSegment {
  id: string;
  startTime: number;
  endTime: number;
  score: number;  // 0-100
  transcript?: string;
  tags?: string[];
}

interface Props {
  segments: SpineSegment[];
  duration: number;  // Total VOD duration in seconds
  audioPeaks?: number[];  // Optional waveform peaks (0-1 normalized)
  currentTime?: number;  // Playhead position
  onSegmentClick: (seg: SpineSegment) => void;
  onSegmentHover?: (seg: SpineSegment | null) => void;
  height?: number;
}

/** Convert score -> gem color + glow */
function scoreToColor(score: number): { fill: string; glow: string; label: string } {
  if (score >= 90) return { fill: '#EF4444', glow: 'rgba(239, 68, 68, 0.6)', label: 'viral' };  // red
  if (score >= 80) return { fill: '#F59E0B', glow: 'rgba(245, 158, 11, 0.5)', label: 'gold' };  // gold
  if (score >= 70) return { fill: '#22C55E', glow: 'rgba(34, 197, 94, 0.4)', label: 'good' };   // green
  if (score >= 60) return { fill: '#3B82F6', glow: 'rgba(59, 130, 246, 0.3)', label: 'ok' };    // blue
  return { fill: '#6B7280', glow: 'rgba(107, 114, 128, 0.2)', label: 'low' };                    // gray
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VodSpine({
  segments,
  duration,
  audioPeaks,
  currentTime = 0,
  onSegmentClick,
  onSegmentHover,
  height = 180,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const seenViralIdsRef = useRef<Set<string>>(new Set());
  const firstRenderRef = useRef(true);

  // Celebrate newly discovered viral segments (score ≥ 90). On first render we
  // just mark everything as seen so we don't fire for segments that loaded from
  // disk — the burst is reserved for segments that actually arrived live.
  useEffect(() => {
    if (firstRenderRef.current) {
      segments.forEach((s) => seenViralIdsRef.current.add(s.id));
      firstRenderRef.current = false;
      return;
    }
    for (const seg of segments) {
      if (seg.score >= 90 && !seenViralIdsRef.current.has(seg.id)) {
        seenViralIdsRef.current.add(seg.id);
        celebrate('viral');
        sfxViral();
      }
    }
  }, [segments]);

  const spineY = height / 2;
  const gemRadius = 8;

  // Generate tick marks every 60s
  const ticks = useMemo(() => {
    const result: number[] = [];
    if (duration <= 0) return result;
    const interval = duration > 3600 ? 600 : duration > 600 ? 60 : 30;
    for (let t = 0; t <= duration; t += interval) result.push(t);
    return result;
  }, [duration]);

  // Sample the waveform down to ~120 bars
  const waveBars = useMemo(() => {
    if (!audioPeaks || audioPeaks.length === 0) return [];
    const targetBars = 120;
    const step = Math.floor(audioPeaks.length / targetBars);
    if (step < 1) return audioPeaks.slice(0, targetBars);
    const result: number[] = [];
    for (let i = 0; i < targetBars; i++) {
      const slice = audioPeaks.slice(i * step, (i + 1) * step);
      result.push(slice.length > 0 ? Math.max(...slice) : 0);
    }
    return result;
  }, [audioPeaks]);

  const handleHover = (seg: SpineSegment | null) => {
    setHoveredId(seg?.id ?? null);
    onSegmentHover?.(seg);
  };

  const hoveredSeg = hoveredId ? segments.find((s) => s.id === hoveredId) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-visible bg-gradient-to-b from-[#0A0A0F] to-[#13131A] border border-white/5"
      style={{ height }}
    >
      {/* Time ticks bottom */}
      <div className="absolute inset-x-0 bottom-0 h-5 border-t border-white/5">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute bottom-0 text-[9px] text-white/30 tabular-nums"
            style={{ left: `${(t / duration) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-1.5 bg-white/20 mb-0.5 mx-auto" />
            {formatTime(t)}
          </div>
        ))}
      </div>

      {/* Waveform background */}
      {waveBars.length > 0 && (
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: spineY - 40, height: 80 }}
        >
          <svg width="100%" height="80" preserveAspectRatio="none" viewBox="0 0 120 80">
            {waveBars.map((peak, i) => {
              const h = Math.max(1, peak * 70);
              return (
                <rect
                  key={i}
                  x={i}
                  y={40 - h / 2}
                  width={0.7}
                  height={h}
                  fill="rgba(100, 116, 139, 0.3)"
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Spine horizontal line */}
      <div
        className="absolute inset-x-0 h-px bg-white/10"
        style={{ top: spineY }}
      />

      {/* Playhead */}
      {currentTime > 0 && (
        <motion.div
          className="absolute top-0 bottom-5 w-px bg-white/50 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Segment gems */}
      {segments.map((seg) => {
        const midTime = (seg.startTime + seg.endTime) / 2;
        const leftPct = (midTime / duration) * 100;
        const color = scoreToColor(seg.score);
        const segDuration = seg.endTime - seg.startTime;
        const widthPct = Math.max(0.5, (segDuration / duration) * 100);
        const isHovered = hoveredId === seg.id;
        const pulseDuration = Math.max(0.8, 2 - (seg.score / 100) * 1.5);

        return (
          <div
            key={seg.id}
            className="absolute top-0 bottom-5 group cursor-pointer"
            style={{ left: `${leftPct}%`, transform: 'translateX(-50%)', width: `${widthPct}%`, minWidth: 16 }}
            onClick={() => onSegmentClick(seg)}
            onMouseEnter={() => handleHover(seg)}
            onMouseLeave={() => handleHover(null)}
          >
            {/* Segment duration bar */}
            <div
              className="absolute h-0.5 transition-all"
              style={{
                top: spineY,
                left: 0,
                right: 0,
                backgroundColor: color.fill,
                boxShadow: isHovered ? `0 0 12px ${color.glow}` : 'none',
                opacity: isHovered ? 1 : 0.6,
              }}
            />
            {/* The gem itself */}
            <motion.div
              className="absolute rounded-full"
              style={{
                top: spineY - gemRadius,
                left: '50%',
                transform: 'translateX(-50%)',
                width: gemRadius * 2,
                height: gemRadius * 2,
                backgroundColor: color.fill,
                boxShadow: `0 0 ${12 + (seg.score / 100) * 20}px ${color.glow}, 0 0 2px ${color.fill}`,
              }}
              animate={{
                scale: isHovered ? [1, 1.3, 1] : [1, 1.15, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                scale: { duration: isHovered ? 0.4 : pulseDuration, repeat: Infinity, ease: 'easeInOut' },
                opacity: { duration: pulseDuration, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
            {/* Score label on hover */}
            {isHovered && (
              <div
                className="absolute text-[10px] font-bold tabular-nums pointer-events-none"
                style={{
                  top: spineY - gemRadius - 18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: color.fill,
                  textShadow: `0 0 6px ${color.glow}`,
                }}
              >
                {Math.round(seg.score)}
              </div>
            )}
          </div>
        );
      })}

      {/* Hover preview */}
      <AnimatePresence>
        {hoveredSeg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-10 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl pointer-events-none"
            style={{
              left: `${(((hoveredSeg.startTime + hoveredSeg.endTime) / 2) / duration) * 100}%`,
              transform: 'translateX(-50%)',
              top: -90,
              width: 240,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">
                {scoreToColor(hoveredSeg.score).label}
              </span>
              <span className="text-sm font-bold" style={{ color: scoreToColor(hoveredSeg.score).fill }}>
                {Math.round(hoveredSeg.score)}
              </span>
            </div>
            <div className="text-[10px] text-white/40 tabular-nums mb-1.5">
              {formatTime(hoveredSeg.startTime)} -&gt; {formatTime(hoveredSeg.endTime)} · {(hoveredSeg.endTime - hoveredSeg.startTime).toFixed(0)}s
            </div>
            {hoveredSeg.transcript && (
              <div className="text-xs text-white/80 line-clamp-2 italic">
                "{hoveredSeg.transcript.slice(0, 120)}…"
              </div>
            )}
            {hoveredSeg.tags && hoveredSeg.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {hoveredSeg.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
          Aucun segment détecté
        </div>
      )}
    </div>
  );
}
