import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useToastStore } from '@/store';

interface Props {
  artifactIds: string[];
  projectId: string;
  onClose: () => void;
}

type Platform = 'tiktok' | 'youtube' | 'instagram';

export default function BatchPublishModal({ artifactIds, projectId, onClose }: Props) {
  const { addToast } = useToastStore();
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(['tiktok']));
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<Array<{ artifactId: string; platform: string; success: boolean; error?: string }>>([]);
  const [interval, setIntervalMin] = useState(5); // minutes between each publish

  useEffect(() => {
    api.getSocialStatus().then((r: any) => {
      const accs = r?.data?.connected_accounts || r?.connected_accounts || [];
      setConnected(new Set(accs.map((a: any) => typeof a === 'string' ? a : a.platform)));
    });
  }, []);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const handlePublish = async () => {
    if (platforms.size === 0) {
      addToast({ type: 'warning', title: 'Aucune plateforme', message: 'Sélectionne au moins une plateforme.' });
      return;
    }
    const unconnected = Array.from(platforms).filter((p) => !connected.has(p));
    if (unconnected.length > 0) {
      addToast({ type: 'warning', title: 'Non connecté', message: `Connecte d'abord : ${unconnected.join(', ')}` });
      return;
    }
    setPublishing(true);
    const newResults: Array<{ artifactId: string; platform: string; success: boolean; error?: string }> = [];

    const now = new Date();
    let offsetMinutes = 0;

    for (const artifactId of artifactIds) {
      for (const platform of platforms) {
        const scheduleTime = offsetMinutes === 0 ? undefined : new Date(now.getTime() + offsetMinutes * 60000).toISOString();
        try {
          const res = await api.publishArtifactToSocial({
            artifactId,
            projectId,
            platform,
            title: '',  // Backend will use defaults / pre-generated content
            scheduleTime,
          });
          const resData = (res as any)?.data ?? res;
          newResults.push({
            artifactId,
            platform,
            success: resData?.success ?? resData?.status === 'scheduled',
            error: resData?.error,
          });
        } catch (e: any) {
          newResults.push({ artifactId, platform, success: false, error: e?.message });
        }
        offsetMinutes += interval;
      }
    }

    setResults(newResults);
    setPublishing(false);
    const successCount = newResults.filter((r) => r.success).length;
    addToast({
      type: successCount === newResults.length ? 'success' : 'warning',
      title: 'Batch publish',
      message: `${successCount}/${newResults.length} publications réussies.`,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold">Publier {artifactIds.length} clips</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">Distribution automatique avec intervalles</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Plateformes</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['tiktok', 'youtube', 'instagram'] as Platform[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`p-3 rounded-lg border transition-colors ${
                      platforms.has(p) ? 'border-viral-medium bg-viral-medium/10' : 'border-white/10'
                    }`}
                  >
                    <div className="text-2xl">{p === 'tiktok' ? '🎵' : p === 'youtube' ? '▶️' : '📸'}</div>
                    <div className="text-xs mt-1 capitalize">{p}</div>
                    {connected.has(p) ? (
                      <div className="text-[10px] text-green-400 mt-0.5">✓ Connecté</div>
                    ) : (
                      <div className="text-[10px] text-red-400 mt-0.5">Non connecté</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Intervalle entre publications</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={interval}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
                <span className="text-sm text-[var(--text-muted)]">minutes (0 = tout publier maintenant)</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Total estimé : {artifactIds.length * platforms.size} publications sur {Math.round(artifactIds.length * platforms.size * interval)} min
              </p>
            </div>

            {results.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${r.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {r.success ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span className="truncate">{r.artifactId.slice(0, 8)} → {r.platform}</span>
                    {r.error && <span className="text-[10px] opacity-70 truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={publishing}>Fermer</Button>
            <Button onClick={handlePublish} disabled={publishing || platforms.size === 0}>
              {publishing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publication...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Lancer le batch</>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
