import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJobsStore } from '@/store';
import { useGpuStats } from '@/lib/hooks/useGpuStats';
import { usePageVisibility } from '@/lib/hooks/usePageVisibility';

// Simple backend probe endpoint: GET /v1/gpu/stats
// The backend parses nvidia-smi and returns a zero-valued payload when no GPU is present.

export default function FurnaceHUD() {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);
  const pageVisible = usePageVisibility();
  const sparkIdRef = useRef(0);
  const [sparks, setSparks] = useState<Array<{ id: number; x: number; delay: number }>>([]);
  const activeJobs = useJobsStore((s) => s.jobs.filter((j) => j.status === 'running').length);

  // Shared GPU stats — React Query dedups across any other component
  // subscribing to the same `['gpu-stats']` key. Auto-pauses when the
  // widget is hidden or the tab/document is not visible.
  const { data: stats = null } = useGpuStats(visible && pageVisible);

  // Emit sparks based on GPU utilization
  useEffect(() => {
    if (!stats || stats.utilization_pct < 20) return;
    const rate = Math.max(1, Math.floor(stats.utilization_pct / 20)); // 1-5 sparks per burst
    const interval = setInterval(() => {
      const newSparks = Array.from({ length: rate }, () => ({
        id: sparkIdRef.current++,
        x: Math.random() * 100,
        delay: Math.random() * 0.3,
      }));
      setSparks((prev) => [...prev, ...newSparks].slice(-20));
      // Auto-cleanup
      setTimeout(
        () =>
          setSparks((prev) =>
            prev.filter((s) => !newSparks.find((ns) => ns.id === s.id)),
          ),
        2000,
      );
    }, 800);
    return () => clearInterval(interval);
  }, [stats]);

  if (!stats || !visible) {
    return (
      <button
        className="fixed bottom-4 right-4 z-[40] w-8 h-8 bg-black/60 border border-white/10 rounded-full text-xs opacity-30 hover:opacity-100 transition-opacity"
        onClick={() => setVisible(true)}
        title="Show Furnace"
      >
        🔥
      </button>
    );
  }

  const util = stats.utilization_pct;
  const vramPct = stats.vram_total_mb > 0 ? (stats.vram_used_mb / stats.vram_total_mb) * 100 : 0;
  const powerPct = stats.power_max_w ? (stats.power_w / stats.power_max_w) * 100 : 0;

  // Heartbeat BPM: 60 BPM idle → 180 BPM full load
  const bpm = 60 + (util / 100) * 120;
  const beatDuration = 60 / bpm; // seconds per beat

  // Flame color based on power
  const flameColor =
    powerPct < 25
      ? '#3B82F6'
      : powerPct < 50
      ? '#F59E0B'
      : powerPct < 75
      ? '#F97316'
      : '#EF4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed bottom-4 right-4 z-[40] ${
        expanded ? 'w-72' : 'w-52'
      } bg-black/70 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl transition-all`}
    >
      {/* Spark emitter */}
      <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {sparks.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], y: -80, scale: [0.5, 1.2, 0.3] }}
              transition={{ duration: 1.5, delay: s.delay, ease: 'easeOut' }}
              className="absolute bottom-0 w-1 h-1 rounded-full"
              style={{
                left: `${s.x}%`,
                backgroundColor: flameColor,
                boxShadow: `0 0 6px ${flameColor}`,
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Header — heartbeat */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 relative z-10"
        onClick={() => setExpanded(!expanded)}
      >
        <motion.div
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: beatDuration, repeat: Infinity, ease: 'easeInOut' }}
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: flameColor, boxShadow: `0 0 8px ${flameColor}` }}
        />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Furnace</div>
          <div className="text-sm font-bold">
            {util.toFixed(0)}% · {stats.power_w.toFixed(0)}W
          </div>
        </div>
        <div className="text-[10px] text-white/40">{expanded ? '▼' : '▲'}</div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-10 border-t border-white/5"
          >
            <div className="p-3 space-y-3">
              {/* VRAM bellows */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
                  <span>VRAM</span>
                  <span>
                    {(stats.vram_used_mb / 1024).toFixed(1)} /{' '}
                    {(stats.vram_total_mb / 1024).toFixed(0)} GB
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
                  <motion.div
                    animate={{ width: `${vramPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, #F59E0B 0%, #EF4444 100%)`,
                      boxShadow: vramPct > 85 ? '0 0 8px #EF4444' : 'none',
                    }}
                  />
                </div>
              </div>

              {/* Power flame */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
                  <span>Puissance</span>
                  <span>{stats.power_w.toFixed(0)} W</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    animate={{ width: `${Math.min(100, powerPct)}%` }}
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: flameColor,
                      boxShadow: `0 0 6px ${flameColor}`,
                    }}
                  />
                </div>
              </div>

              {/* Temp + jobs */}
              <div className="flex items-center justify-between text-[10px] text-white/60">
                <span>🌡 {stats.temp_c}°C</span>
                <span>
                  {activeJobs} job{activeJobs > 1 ? 's' : ''} actif
                  {activeJobs > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center border-t border-white/5">
              <button
                className="flex-1 text-[10px] text-white/40 hover:text-white/80 py-1.5"
                onClick={() => setVisible(false)}
              >
                Masquer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
