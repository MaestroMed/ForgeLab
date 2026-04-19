/**
 * Social Publishing Modal
 *
 * Opens from ExportPanel → "Publier" button on each export.
 * Publishes the artifact to TikTok / YouTube Shorts / Instagram.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Send, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useToastStore } from '@/store';

interface Props {
  artifactId: string;
  projectId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultHashtags?: string[];
  onClose: () => void;
}

type Platform = 'tiktok' | 'youtube' | 'instagram';

const PLATFORM_INFO: Record<Platform, { label: string; emoji: string; titleMax: number; descMax: number }> = {
  tiktok: { label: 'TikTok', emoji: '🎵', titleMax: 100, descMax: 2200 },
  youtube: { label: 'YouTube Shorts', emoji: '▶️', titleMax: 100, descMax: 5000 },
  instagram: { label: 'Instagram Reels', emoji: '📸', titleMax: 100, descMax: 2200 },
};

export default function SocialPublishModal({
  artifactId,
  projectId,
  defaultTitle = '',
  defaultDescription = '',
  defaultHashtags = [],
  onClose,
}: Props) {
  const { addToast } = useToastStore();
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [connected, setConnected] = useState<Platform[]>([]);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [hashtags, setHashtags] = useState(defaultHashtags.join(' '));
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null);

  useEffect(() => {
    (api.getSocialStatus() as Promise<any>).then((r: any) => {
      const data = r?.data ?? r;
      const accs = data?.connected_accounts || [];
      setConnected(accs.map((a: any) => (typeof a === 'string' ? a : a.platform)));
    });
  }, []);

  const isConnected = connected.includes(platform);
  const info = PLATFORM_INFO[platform];

  const handlePublish = async () => {
    if (!isConnected) {
      addToast({ type: 'warning', title: 'Non connecté', message: `Connecte d'abord ${info.label} dans les Paramètres.` });
      return;
    }
    setPublishing(true);
    try {
      const hashtagArray = hashtags.split(/\s+/).filter((h) => h.trim()).map((h) => h.startsWith('#') ? h : `#${h}`);
      const res: any = await api.publishArtifactToSocial({
        artifactId,
        projectId,
        platform,
        title: title.slice(0, info.titleMax),
        description: description.slice(0, info.descMax),
        hashtags: hashtagArray,
        scheduleTime: scheduleEnabled && scheduleTime ? new Date(scheduleTime).toISOString() : undefined,
        visibility,
      });
      const payload = res?.data ?? res;
      const wasScheduled = payload?.status === 'scheduled';
      setResult({
        success: payload?.success ?? false,
        url: payload?.video_url ?? undefined,
        error: payload?.error ?? undefined,
      });
      if (payload?.success) {
        addToast({
          type: 'success',
          title: wasScheduled ? 'Programmé !' : 'Publié !',
          message: wasScheduled
            ? `Clip programmé pour ${info.label}.`
            : `Clip envoyé sur ${info.label}.`,
        });
      }
    } catch (e: any) {
      setResult({ success: false, error: e?.message ?? 'Échec de la publication' });
    } finally {
      setPublishing(false);
    }
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
              <h2 className="text-lg font-bold">Publier sur les réseaux</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">Envoi direct vers la plateforme</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Platform selector */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Plateforme</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(Object.entries(PLATFORM_INFO) as [Platform, typeof PLATFORM_INFO[Platform]][]).map(([p, i]) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`p-3 rounded-lg border transition-colors ${
                      platform === p ? 'border-viral-medium bg-viral-medium/10' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="text-2xl">{i.emoji}</div>
                    <div className="text-xs mt-1">{i.label}</div>
                    {connected.includes(p) ? (
                      <div className="text-[10px] text-green-400 mt-0.5">✓ Connecté</div>
                    ) : (
                      <div className="text-[10px] text-red-400 mt-0.5">Non connecté</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                <span>Titre</span>
                <span>{title.length}/{info.titleMax}</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, info.titleMax))}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                placeholder="Accroche virale..."
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                <span>Description</span>
                <span>{description.length}/{info.descMax}</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, info.descMax))}
                rows={3}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-viral-medium resize-none"
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Hashtags</label>
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                placeholder="#viral #fyp #gaming..."
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {hashtags.split(/\s+/).filter((h) => h.trim()).slice(0, 20).map((h, i) => (
                  <span key={i} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />
                <Calendar className="w-4 h-4" />
                <span>Programmer pour plus tard</span>
              </label>
              {scheduleEnabled && (
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full mt-2 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                />
              )}
            </div>

            {/* Visibility */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Visibilité</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
              >
                <option value="public">Public</option>
                <option value="unlisted">Non répertoriée (YouTube)</option>
                <option value="private">Privée</option>
              </select>
            </div>

            {/* Result */}
            {result && (
              <div className={`p-3 rounded-lg border flex items-start gap-2 ${
                result.success ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {result.success ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <div className="text-xs flex-1">
                  {result.success ? (
                    <>
                      <p className="font-semibold">Publication réussie !</p>
                      {result.url && <a href={result.url} target="_blank" rel="noreferrer" className="underline">Voir sur {info.label}</a>}
                    </>
                  ) : (
                    <p>{result.error ?? 'Échec'}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={publishing}>Annuler</Button>
            <Button
              onClick={handlePublish}
              disabled={publishing || !isConnected || !title}
            >
              {publishing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publication...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> {scheduleEnabled ? 'Programmer' : 'Publier maintenant'}</>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
