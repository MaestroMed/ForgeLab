/**
 * One-Click Pipeline Modal
 *
 * Paste URL, pick preset, click Go — end-to-end production.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useToastStore } from '@/store';

interface Props {
  initialUrl?: string;
  onClose: () => void;
  onComplete?: (projectId: string) => void;
}

interface Preset {
  id: string;
  name: string;
  platform: string;
  target_count: number;
  min_score: number;
}

interface Run {
  id: string;
  stage: string;
  progress: number;
  message: string;
  error: string | null;
  project_id: string | null;
  exported_count: number;
  published_count: number;
}

export default function OneClickModal({ initialUrl = '', onClose, onComplete }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('tiktok_quick');
  const [run, setRun] = useState<Run | null>(null);
  const [launching, setLaunching] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    api
      .listPipelinePresets()
      .then((r: any) => {
        const list: Preset[] = r?.data?.presets || r?.presets || [];
        setPresets(list);
      })
      .catch(() => {
        /* silent: presets endpoint may not be reachable yet */
      });
  }, []);

  useEffect(() => {
    if (!run?.id) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res: any = await api.getPipelineRun(run.id);
        const updated = res?.data ?? res;
        if (!cancelled && updated) {
          const next: Run = {
            id: run.id,
            stage: updated.stage ?? run.stage,
            progress: typeof updated.progress === 'number' ? updated.progress : run.progress,
            message: updated.message ?? run.message,
            error: updated.error ?? null,
            project_id: updated.project_id ?? run.project_id ?? null,
            exported_count:
              typeof updated.exported_count === 'number'
                ? updated.exported_count
                : Array.isArray(updated.exported_artifacts)
                  ? updated.exported_artifacts.length
                  : run.exported_count,
            published_count:
              typeof updated.published_count === 'number'
                ? updated.published_count
                : Array.isArray(updated.published_schedule_ids)
                  ? updated.published_schedule_ids.length
                  : run.published_count,
          };
          setRun(next);
          if (next.stage === 'completed' && next.project_id) {
            onComplete?.(next.project_id);
          }
        }
      } catch {
        /* swallow transient errors */
      }
    };
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [run?.id, onComplete]);

  const launch = async () => {
    if (!url.trim()) return;
    setLaunching(true);
    try {
      const res: any = await api.startPipeline({
        source_url: url,
        preset_id: selectedPreset,
      });
      const runId = res?.data?.run_id ?? res?.run_id;
      if (runId) {
        setRun({
          id: runId,
          stage: 'pending',
          progress: 0,
          message: 'Lancement...',
          error: null,
          project_id: null,
          exported_count: 0,
          published_count: 0,
        });
      }
    } catch (e: any) {
      addToast({
        type: 'error',
        title: 'Échec',
        message: e?.message || 'Pipeline non lancée',
      });
    } finally {
      setLaunching(false);
    }
  };

  const isRunning = !!run && run.stage !== 'completed' && run.stage !== 'failed';
  const isDone = run?.stage === 'completed';
  const isFailed = run?.stage === 'failed';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={isRunning ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl w-full max-w-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-gradient-to-r from-viral-medium/10 to-viral-high/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-viral-medium/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-viral-medium" />
              </div>
              <div>
                <h2 className="text-lg font-bold">One-click Pipeline</h2>
                <p className="text-xs text-[var(--text-muted)]">VOD → clips prêts en un clic</p>
              </div>
            </div>
            {!isRunning && (
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="p-6 space-y-4">
            {!run && (
              <>
                <div>
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    URL de la vidéo
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://youtube.com/... ou https://twitch.tv/..."
                    className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Preset
                  </label>
                  <div className="mt-2 space-y-2">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPreset(p.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedPreset === p.id
                            ? 'border-viral-medium bg-viral-medium/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                              {p.target_count} clips · score ≥ {p.min_score} · {p.platform}
                            </div>
                          </div>
                          {selectedPreset === p.id && (
                            <CheckCircle className="w-4 h-4 text-viral-medium" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {run && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{run.message}</span>
                    <span className="text-sm font-bold">{Math.round(run.progress)}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-viral-medium to-viral-high transition-all duration-500"
                      style={{ width: `${Math.max(0, Math.min(run.progress, 100))}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Étape : {run.stage}</span>
                  {run.exported_count > 0 && <span>{run.exported_count} clips générés</span>}
                </div>

                {isDone && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">Pipeline terminée !</p>
                      <p className="text-xs opacity-80">
                        {run.exported_count} clip{run.exported_count > 1 ? 's' : ''} prêts à
                        publier
                      </p>
                    </div>
                  </div>
                )}

                {isFailed && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">Échec</p>
                      <p className="text-xs opacity-80">{run.error || 'Erreur inconnue'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end gap-2">
            {!run && (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Annuler
                </Button>
                <Button onClick={launch} disabled={!url.trim() || launching}>
                  {launching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Lancement...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Lancer la pipeline
                    </>
                  )}
                </Button>
              </>
            )}
            {isDone && <Button onClick={onClose}>Fermer</Button>}
            {isFailed && (
              <>
                <Button variant="secondary" onClick={() => setRun(null)}>
                  Réessayer
                </Button>
                <Button onClick={onClose}>Fermer</Button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
