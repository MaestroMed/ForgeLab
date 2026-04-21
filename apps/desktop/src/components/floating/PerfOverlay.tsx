import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGpuStats } from '@/lib/hooks/useGpuStats';
import { useJobsStore } from '@/store';

export default function PerfOverlay() {
  const [visible, setVisible] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('forge-perf-overlay') === '1';
  });
  const [fps, setFps] = useState(60);
  const [memory, setMemory] = useState<{ used: number; limit: number } | null>(null);
  const { data: gpu } = useGpuStats(visible);
  const jobs = useJobsStore((s) => s.jobs);
  const runningJobs = jobs.filter((j) => j.status === 'running').length;

  const frameCountRef = useRef(0);
  const lastUpdateRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  // FPS counter via rAF
  useEffect(() => {
    if (!visible) return;
    const loop = () => {
      frameCountRef.current++;
      const now = performance.now();
      const dt = now - lastUpdateRef.current;
      if (dt >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / dt));
        frameCountRef.current = 0;
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  // Memory via performance.memory (Chromium only)
  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const mem = (performance as any).memory;
      if (mem) {
        setMemory({
          used: mem.usedJSHeapSize / 1024 / 1024,
          limit: mem.jsHeapSizeLimit / 1024 / 1024,
        });
      }
    };
    update();
    const iv = setInterval(update, 2000);
    return () => clearInterval(iv);
  }, [visible]);

  // Global keyboard toggle: Ctrl+Shift+P
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        const target = e.target as HTMLElement;
        if (target.matches('input, textarea, [contenteditable]')) return;
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          try { localStorage.setItem('forge-perf-overlay', next ? '1' : '0'); } catch {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!visible) return null;

  const fpsColor = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400';
  const gpuUtil = gpu?.utilization_pct ?? 0;
  const gpuColor = gpuUtil > 80 ? 'text-red-400' : gpuUtil > 50 ? 'text-yellow-400' : 'text-green-400';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="fixed bottom-4 left-4 z-[60] bg-black/70 backdrop-blur-md border border-white/5 rounded-md px-3 py-2 font-mono text-[10px] text-white/80 pointer-events-none select-none"
      >
        <div className="flex flex-col gap-0.5 tabular-nums">
          <div className="flex items-center gap-3">
            <span>FPS</span>
            <span className={`${fpsColor} font-bold`}>{fps}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>GPU</span>
            <span className={gpuColor}>{gpuUtil.toFixed(0)}%</span>
            {gpu && (
              <span className="text-white/50">
                {((gpu.vram_used_mb / gpu.vram_total_mb) * 100).toFixed(0)}% vram
              </span>
            )}
          </div>
          {memory && (
            <div className="flex items-center gap-3">
              <span>HEAP</span>
              <span className="text-white/70">
                {memory.used.toFixed(0)}/{memory.limit.toFixed(0)} MB
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span>JOBS</span>
            <span className={runningJobs > 0 ? 'text-viral-medium' : 'text-white/50'}>
              {runningJobs} run · {jobs.length} total
            </span>
          </div>
          {gpu && gpu.temp_c > 0 && (
            <div className="flex items-center gap-3">
              <span>TEMP</span>
              <span className={gpu.temp_c > 80 ? 'text-red-400' : 'text-white/70'}>
                {gpu.temp_c.toFixed(0)}°C
              </span>
            </div>
          )}
        </div>
        <div className="mt-1 pt-1 border-t border-white/5 text-[9px] text-white/30">
          Ctrl+Shift+P to toggle
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
