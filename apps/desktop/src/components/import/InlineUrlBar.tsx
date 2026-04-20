import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToastStore, useJobsStore } from '@/store';
import { useNavigate } from 'react-router-dom';
import { useDictionaries } from '@/lib/hooks/useDictionaries';

interface Props {
  open: boolean;
  initialUrl?: string;
  onClose: () => void;
  onImported?: () => void;
}

interface VideoInfo {
  title?: string;
  duration?: number;
  channel?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  platform?: string;
}

export default function InlineUrlBar({ open, initialUrl = '', onClose, onImported }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [importing, setImporting] = useState(false);
  // Dictionaries rarely change — share a single cached query across every
  // picker in the app.
  const { data: dictionaries = [] } = useDictionaries();
  const [selectedDict, setSelectedDict] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addToast } = useToastStore();
  const { addJob } = useJobsStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      const t = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(t);
    } else {
      setInfo(null);
      setImporting(false);
      return undefined;
    }
  }, [open, initialUrl]);

  // Auto-select the first dictionary once the cached list is available.
  useEffect(() => {
    if (dictionaries.length > 0) {
      setSelectedDict((prev) => prev || dictionaries[0].id);
    }
  }, [dictionaries]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!url.trim() || !open) {
      setInfo(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingInfo(true);
      try {
        const r = await api.getUrlInfo(url);
        if (r?.success && r.data) {
          setInfo(r.data as VideoInfo);
        } else {
          setInfo(null);
        }
      } catch {
        setInfo(null);
      } finally {
        setLoadingInfo(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url, open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleImport = async () => {
    if (!url.trim() || importing) return;
    setImporting(true);
    try {
      const res = await api.importFromUrl(
        url,
        'best',
        true,
        true,
        selectedDict || undefined,
      );
      const project = res?.data?.project;
      const jobId = res?.data?.jobId;
      if (project?.id) {
        addToast({ type: 'success', title: 'Import lancé', message: project.name ?? url });
        addJob({
          id: jobId || `import-${Date.now()}`,
          type: 'download',
          projectId: project.id,
          status: 'running',
          progress: 0,
          stage: 'Téléchargement…',
        });
        onImported?.();
        onClose();
        navigate(`/project/${project.id}`);
      } else {
        throw new Error(res?.error || 'Import impossible');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import impossible';
      addToast({ type: 'error', title: 'Échec', message: msg });
    } finally {
      setImporting(false);
    }
  };

  const thumbnail = info?.thumbnail ?? info?.thumbnailUrl;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="fixed top-0 inset-x-0 z-[100] bg-black/80 backdrop-blur-xl border-b border-white/10"
        >
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <Link2 className="w-5 h-5 text-viral-medium flex-shrink-0" />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleImport();
                }}
                placeholder="Colle une URL YouTube ou Twitch…"
                className="flex-1 bg-transparent outline-none text-lg placeholder:text-white/30 text-white"
              />
              {dictionaries.length > 0 && (
                <select
                  value={selectedDict}
                  onChange={(e) => setSelectedDict(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80"
                >
                  <option value="">Aucun dict</option>
                  {dictionaries.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name.slice(0, 30)}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={handleImport}
                disabled={!url.trim() || importing}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-viral-medium to-viral-high text-black font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-transform hover:scale-105"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Import…
                  </>
                ) : (
                  <>
                    Importer <kbd className="ml-1 px-1 text-[10px] bg-black/20 rounded">↵</kbd>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inline video info preview */}
            <AnimatePresence>
              {(info || loadingInfo) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 flex items-center gap-3 text-sm"
                >
                  {loadingInfo ? (
                    <span className="text-white/40 italic">Détection en cours…</span>
                  ) : info ? (
                    <>
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          alt=""
                          className="w-20 h-11 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white truncate font-medium">{info.title}</div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {info.channel}
                          {info.duration ? ` · ${Math.floor(info.duration / 60)}min` : ''}
                        </div>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
