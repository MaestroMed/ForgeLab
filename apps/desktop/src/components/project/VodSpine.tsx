import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { celebrate } from '@/components/ambient/Celebration';
import { sfxViral } from '@/lib/sfx';
import { ENGINE_BASE_URL } from '@/lib/config';

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
  projectId?: string;  // When provided, enables the scrubbable hover preview
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
  projectId,
  onSegmentClick,
  onSegmentHover,
  height = 180,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scrubberPosition, setScrubberPosition] = useState(0);  // 0-1 within hovered gem
  const [hoveredGemEl, setHoveredGemEl] = useState<HTMLElement | null>(null);
  const seenViralIdsRef = useRef<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const firstRenderRef = useRef(true);

  // rAF-throttled scrubber updates — mousemove can fire 60-120Hz but we only
  // need one state update per frame. Coalescing here prevents runaway renders
  // and keeps the downstream video-seek logic stable.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; width: number } | null>(null);

  // Track newly discovered segments so they get an entrance animation + ripple.
  // On first render we seed the known/seen sets so segments already on disk
  // don't all animate at once — the ceremony is reserved for live arrivals.
  useEffect(() => {
    if (firstRenderRef.current) {
      segments.forEach((s) => {
        seenViralIdsRef.current.add(s.id);
        knownIdsRef.current.add(s.id);
      });
      firstRenderRef.current = false;
      return;
    }

    const newFresh = new Set<string>();
    for (const seg of segments) {
      if (!knownIdsRef.current.has(seg.id)) {
        knownIdsRef.current.add(seg.id);
        newFresh.add(seg.id);
      }
    }

    if (newFresh.size === 0) return;

    setFreshIds((prev) => {
      const next = new Set(prev);
      newFresh.forEach((id) => next.add(id));
      return next;
    });

    // Celebrate newly discovered viral segments (score ≥ 90) that just arrived.
    for (const seg of segments) {
      if (
        seg.score >= 90 &&
        newFresh.has(seg.id) &&
        !seenViralIdsRef.current.has(seg.id)
      ) {
        seenViralIdsRef.current.add(seg.id);
        celebrate('viral');
        sfxViral();
      }
    }

    // Clear the fresh flag after the ripple animation completes so the gem
    // returns to its steady pulsing state.
    const timeout = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        newFresh.forEach((id) => next.delete(id));
        return next;
      });
    }, 1500);
    return () => clearTimeout(timeout);
  }, [segments]);

  // Clean up any pending scrubber rAF on unmount so we don't leak a frame.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

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

  // Stable hover/leave/move callbacks for the memoized Gem subcomponent so
  // the unaffected gems don't re-render whenever hoveredId changes.
  const handleHover = useCallback(
    (seg: SpineSegment, el: HTMLElement) => {
      setHoveredId(seg.id);
      setHoveredGemEl(el);
      onSegmentHover?.(seg);
    },
    [onSegmentHover],
  );

  const handleLeave = useCallback(() => {
    setHoveredId(null);
    setHoveredGemEl(null);
    setScrubberPosition(0);
    onSegmentHover?.(null);
  }, [onSegmentHover]);

  const handleGemMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pendingRef.current = { x: e.clientX - rect.left, width: rect.width };

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      const p = pendingRef.current;
      if (p && p.width > 0) {
        const pct = Math.max(0, Math.min(1, p.x / p.width));
        setScrubberPosition(pct);
      }
      rafRef.current = null;
    });
  }, []);

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
      {segments.map((seg) => (
        <Gem
          key={seg.id}
          seg={seg}
          duration={duration}
          spineY={spineY}
          gemRadius={gemRadius}
          isHovered={hoveredId === seg.id}
          isFresh={freshIds.has(seg.id)}
          onClick={onSegmentClick}
          onHover={handleHover}
          onLeave={handleLeave}
          onMove={handleGemMove}
        />
      ))}

      {/* Hover text tooltip — repositioned BELOW gem when video preview is active, else above */}
      <AnimatePresence>
        {hoveredSeg && (
          <motion.div
            initial={{ opacity: 0, y: projectId ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: projectId ? -10 : 10 }}
            className="absolute z-10 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl pointer-events-none"
            style={{
              left: `${(((hoveredSeg.startTime + hoveredSeg.endTime) / 2) / duration) * 100}%`,
              transform: 'translateX(-50%)',
              ...(projectId
                ? { top: height - 5, marginTop: 8 }
                : { top: -90 }),
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

      {/* Scrubbable video preview floats ABOVE the hovered gem */}
      <AnimatePresence>
        {hoveredSeg && projectId && (
          <HoverVideoPreview
            key={hoveredSeg.id}
            segment={hoveredSeg}
            projectId={projectId}
            scrubberPosition={scrubberPosition}
            parentEl={hoveredGemEl}
          />
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

// ---------------------------------------------------------------------------
// Memoized gem — extracted so only the hovered/unhovered gem re-renders when
// hover state flips, instead of the whole timeline. The `isHovered` /
// `isFresh` / `onClick` / `onHover` / `onLeave` / `onMove` inputs are the only
// things that change at runtime; everything else is derived from the segment.
// ---------------------------------------------------------------------------

interface GemProps {
  seg: SpineSegment;
  duration: number;
  spineY: number;
  gemRadius: number;
  isHovered: boolean;
  isFresh: boolean;
  onClick: (seg: SpineSegment) => void;
  onHover: (seg: SpineSegment, el: HTMLElement) => void;
  onLeave: () => void;
  onMove: (e: React.MouseEvent<HTMLElement>) => void;
}

const Gem = memo(function Gem({
  seg,
  duration,
  spineY,
  gemRadius,
  isHovered,
  isFresh,
  onClick,
  onHover,
  onLeave,
  onMove,
}: GemProps) {
  const midTime = (seg.startTime + seg.endTime) / 2;
  const leftPct = (midTime / duration) * 100;
  const color = scoreToColor(seg.score);
  const segDuration = seg.endTime - seg.startTime;
  const widthPct = Math.max(0.5, (segDuration / duration) * 100);
  const pulseDuration = Math.max(0.8, 2 - (seg.score / 100) * 1.5);

  return (
    <div
      className="absolute top-0 bottom-5 group cursor-pointer"
      style={{ left: `${leftPct}%`, transform: 'translateX(-50%)', width: `${widthPct}%`, minWidth: 16 }}
      onClick={() => onClick(seg)}
      onMouseEnter={(e) => onHover(seg, e.currentTarget)}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
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

      {/* Ripple ring for freshly discovered gems */}
      {isFresh && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: spineY - gemRadius,
            left: '50%',
            width: gemRadius * 2,
            height: gemRadius * 2,
            marginLeft: -gemRadius,
            border: `2px solid ${color.fill}`,
            boxShadow: `0 0 20px ${color.glow}`,
          }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      )}

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
        initial={isFresh ? { scale: 0, opacity: 0 } : false}
        animate={{
          scale: isHovered ? [1, 1.3, 1] : [1, 1.15, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          scale: {
            duration: isHovered ? 0.4 : pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            // Let the pop-in animation run before the pulse kicks in.
            delay: isFresh ? 0.35 : 0,
          },
          opacity: {
            duration: pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: isFresh ? 0.35 : 0,
          },
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
});

// ---------------------------------------------------------------------------
// Scrubbable hover video preview — 9:16 portrait thumbnail that seeks based
// on mouse X position within the hovered gem.
// ---------------------------------------------------------------------------

function HoverVideoPreview({
  segment,
  projectId,
  scrubberPosition,
  parentEl,
}: {
  segment: SpineSegment;
  projectId: string;
  scrubberPosition: number;  // 0-1
  parentEl: HTMLElement | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Seek coalescer — `currentTime = x` on an HTMLVideoElement kicks off an
  // async decoder seek, and hammering it from mousemove causes the decoder
  // to thrash. We keep a pending-target ref plus a seeking-flag ref, and
  // only issue a new seek when the previous one has fired 'seeked'.
  const pendingSeekRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  // Position above the hovered gem. Recompute each render because the parent
  // rect can change as the user moves across adjacent gems.
  const rect = parentEl?.getBoundingClientRect();
  const left = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const rawTop = rect ? rect.top - 220 : 16;
  const top = Math.max(8, rawTop);

  // Seek to scrubber position whenever it changes (once metadata has loaded).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loaded) return;

    const segDuration = segment.endTime - segment.startTime;
    const targetTime = segment.startTime + scrubberPosition * segDuration;
    pendingSeekRef.current = targetTime;

    const trySeek = () => {
      if (seekingRef.current) return;
      const target = pendingSeekRef.current;
      if (target === null) return;
      if (Math.abs(video.currentTime - target) < 0.15) return;

      seekingRef.current = true;
      try {
        video.currentTime = target;
      } catch {
        // Some browsers throw if the buffer isn't ready — reset the flag and
        // let the next move retry.
        seekingRef.current = false;
      }
    };

    const onSeeked = () => {
      seekingRef.current = false;
      // If the user kept moving while we were mid-seek, catch up now.
      const target = pendingSeekRef.current;
      if (target !== null && Math.abs(video.currentTime - target) > 0.15) {
        trySeek();
      }
    };

    video.addEventListener('seeked', onSeeked);
    trySeek();

    return () => {
      video.removeEventListener('seeked', onSeeked);
    };
  }, [scrubberPosition, segment.startTime, segment.endTime, loaded]);

  const currentTimeDisplay =
    segment.startTime + scrubberPosition * (segment.endTime - segment.startTime);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[50] pointer-events-none"
      style={{
        left,
        top,
        transform: 'translate(-50%, 0)',
      }}
    >
      <div className="relative w-[120px] h-[214px] rounded-lg overflow-hidden bg-black shadow-2xl ring-2 ring-white/10">
        <video
          ref={videoRef}
          src={`${ENGINE_BASE_URL}/v1/projects/${projectId}/media/proxy`}
          className="w-full h-full object-cover"
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            try {
              v.currentTime = segment.startTime;
            } catch {
              // ignore
            }
            setLoaded(true);
          }}
        />
        {/* Scrubber indicator */}
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-viral-medium"
          style={{ width: `${scrubberPosition * 100}%` }}
        />
        {/* Time label */}
        <div className="absolute bottom-1 right-1 text-[8px] font-mono text-white/90 bg-black/60 px-1 rounded tabular-nums">
          {formatTime(currentTimeDisplay)}
        </div>
      </div>
    </motion.div>
  );
}
