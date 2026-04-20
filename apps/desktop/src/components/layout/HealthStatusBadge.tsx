import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useHealthStore } from '@/store/health';

export default function HealthStatusBadge() {
  const { health, backendOnline } = useHealthStore();
  const [open, setOpen] = useState(false);

  if (!health || !backendOnline) return null;

  const statusConfig = {
    ok: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  }[health.overall_status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${statusConfig.bg} hover:scale-105 transition-transform`}
      >
        <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.color}`} />
        <span className={statusConfig.color}>Système</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full mt-2 right-0 w-80 bg-[var(--bg-secondary)] border border-white/10 rounded-xl p-4 z-50 shadow-2xl"
          >
            <h3 className="text-sm font-semibold mb-3">État système</h3>
            <div className="space-y-2">
              {Object.entries(health.checks).map(([key, check]) => {
                const chk = check as any;
                const statusIcon = chk.status === 'ok' ? '✅' : chk.status === 'warning' ? '⚠️' : '❌';
                return (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span>{statusIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium capitalize">{key}</p>
                      <p className="text-[var(--text-muted)] truncate">
                        {chk.message ?? chk.version ?? chk.name ?? chk.model ?? ''}
                        {chk.vram_total_mb && ` · ${Math.round(chk.vram_total_mb / 1024)}GB VRAM`}
                        {chk.free_gb !== undefined && ` · ${chk.free_gb}GB libre`}
                        {chk.nvenc !== undefined && ` · NVENC ${chk.nvenc ? '✓' : '✗'}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
