import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Zap, X, Minimize2, Maximize2, GripHorizontal, Terminal } from 'lucide-react';
import { useJobsStore, useFloatingWidgetStore, useUIStore } from '@/store';
import { formatEta } from '@/lib/utils';
import JobLogDrawer from './JobLogDrawer';

const JOB_TYPE_ICONS: Record<string, string> = {
  ingest: '📥',
  analyze: '🔍',
  export: '🎬',
  render_proxy: '🎞️',
  render_final: '🎬',
  download: '⬇️',
  transcription: '🔊',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  ingest: 'Ingestion',
  analyze: 'Analyse',
  export: 'Export',
  render_proxy: 'Proxy',
  render_final: 'Rendu',
  download: 'Téléchargement',
  transcription: 'Transcription',
};

export default function FloatingProcessWidget() {
  const { jobs } = useJobsStore();
  const { visible, collapsed, position, setVisible, setPosition, toggleCollapsed } = useFloatingWidgetStore();
  const { setJobDrawerOpen } = useUIStore();
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [logJobId, setLogJobId] = useState<string | null>(null);
  
  // Get active jobs (running or pending)
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'pending');
  const runningJobs = jobs.filter((j) => j.status === 'running');
  
  // Auto-hide logic: hide after 60s of no activity if no running jobs
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [autoHidden, setAutoHidden] = useState(false);
  
  useEffect(() => {
    if (runningJobs.length > 0) {
      setLastActivityTime(Date.now());
      setAutoHidden(false);
    }
  }, [runningJobs.length]);
  
  useEffect(() => {
    if (runningJobs.length > 0) return;
    
    const timer = setInterval(() => {
      if (Date.now() - lastActivityTime > 60000 && runningJobs.length === 0) {
        setAutoHidden(true);
      }
    }, 10000);
    
    return () => clearInterval(timer);
  }, [lastActivityTime, runningJobs.length]);
  
  // Show widget when new job starts
  useEffect(() => {
    if (runningJobs.length > 0) {
      setAutoHidden(false);
    }
  }, [runningJobs.length]);
  
  // Don't render if explicitly hidden or auto-hidden
  if (!visible || (autoHidden && runningJobs.length === 0)) {
    // Show small indicator to bring it back
    return (
      <>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-20 right-4 z-50"
      >
        <button
          onClick={() => {
            setVisible(true);
            setAutoHidden(false);
          }}
          className="p-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] shadow-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Afficher le widget de progression"
        >
          <Zap className="w-4 h-4 text-[var(--accent-color)]" />
          {runningJobs.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {runningJobs.length}
            </span>
          )}
        </button>
      </motion.div>
      {logJobId && (
        <JobLogDrawer jobId={logJobId} onClose={() => setLogJobId(null)} />
      )}
      </>
    );
  }
  
  return (
    <>
      {/* Drag constraints container */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-40" />
      
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onDragEnd={(_, info) => {
          setPosition({
            x: position.x + info.offset.x,
            y: position.y + info.offset.y,
          });
        }}
        style={{ x: position.x, y: position.y }}
        className="fixed z-50 pointer-events-auto"
      >
        <div 
          className={`
            bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl
            backdrop-blur-sm overflow-hidden transition-all duration-200
            ${collapsed ? 'w-48' : 'w-72'}
          `}
        >
          {/* Header - Draggable */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-3 h-3 text-[var(--text-muted)]" />
              <Zap className="w-4 h-4 text-[var(--accent-color)]" />
              <span className="text-xs font-medium text-[var(--text-primary)]">
                {activeJobs.length} tâche{activeJobs.length !== 1 ? 's' : ''}
              </span>
              {runningJobs.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={toggleCollapsed}
                className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                title={collapsed ? 'Développer' : 'Réduire'}
              >
                {collapsed ? (
                  <Maximize2 className="w-3 h-3 text-[var(--text-muted)]" />
                ) : (
                  <Minimize2 className="w-3 h-3 text-[var(--text-muted)]" />
                )}
              </button>
              <button
                onClick={() => setVisible(false)}
                className="p-1 rounded hover:bg-red-500/10 transition-colors"
                title="Masquer"
              >
                <X className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {activeJobs.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-[var(--text-muted)]">
                      Aucune tâche en cours
                    </p>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    {activeJobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="px-3 py-2 border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
                        onClick={() => setJobDrawerOpen(true)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {JOB_TYPE_ICONS[job.type] || '⚙️'}
                            </span>
                            <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[120px]">
                              {job.stage || JOB_TYPE_LABELS[job.type] || job.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogJobId(job.id);
                              }}
                              title="Voir les logs en temps réel"
                              className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              <Terminal className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-bold text-[var(--accent-color)] tabular-nums">
                              {job.progress.toFixed(0)}%
                              {formatEta(job.etaSeconds) && (
                                <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                                  · {formatEta(job.etaSeconds)}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>

                        {job.message && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1 truncate">
                            {job.message}
                          </p>
                        )}
                      </div>
                    ))}
                    
                    {activeJobs.length > 5 && (
                      <button
                        onClick={() => setJobDrawerOpen(true)}
                        className="w-full px-3 py-2 text-xs text-center text-[var(--accent-color)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        +{activeJobs.length - 5} autres tâches
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Collapsed state - show mini progress */}
          {collapsed && runningJobs.length > 0 && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[var(--text-muted)] truncate">
                  {runningJobs[0].stage || JOB_TYPE_LABELS[runningJobs[0].type]}
                </span>
                <span className="text-[10px] font-bold text-[var(--accent-color)]">
                  {runningJobs[0].progress.toFixed(0)}%
                  {formatEta(runningJobs[0].etaSeconds) && (
                    <span className="ml-1 font-normal text-[var(--text-muted)]">
                      · {formatEta(runningJobs[0].etaSeconds)}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                  animate={{ width: `${runningJobs[0].progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {logJobId && (
        <JobLogDrawer jobId={logJobId} onClose={() => setLogJobId(null)} />
      )}
    </>
  );
}
