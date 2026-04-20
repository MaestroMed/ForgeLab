import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerOff, RotateCw } from 'lucide-react';
import { useHealthStore } from '@/store/health';
import { Button } from '@/components/ui/Button';

export default function BackendDownOverlay() {
  const { backendOnline, loading, lastCheck, check, startPolling, stopPolling } = useHealthStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Only show after first check and if still offline
  const showOverlay = lastCheck > 0 && !backendOnline;

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
        >
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
              <ServerOff className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Moteur FORGE hors ligne</h1>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Impossible de contacter le backend Python. Vérifiez qu'il tourne sur le port 8420.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Dépannage</p>
              <ul className="text-xs space-y-1 text-[var(--text-muted)]">
                <li>• Le processus Python a-t-il planté ?</li>
                <li>• Consulter les logs dans <code className="text-viral-medium">FORGE_LIBRARY/</code></li>
                <li>• Redémarrer l'app (Cmd/Ctrl+R)</li>
                <li>• Vérifier le port 8420 libre (<code className="text-viral-medium">netstat -an | grep 8420</code>)</li>
              </ul>
            </div>
            <Button onClick={() => check()} disabled={loading}>
              <RotateCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Vérification...' : 'Réessayer'}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
