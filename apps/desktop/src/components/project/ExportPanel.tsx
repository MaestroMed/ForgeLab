import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Play, Pause, FolderOpen, CheckCircle, X, Volume2, VolumeX, RefreshCw, Sparkles, Eye, Send } from 'lucide-react';
import { ENGINE_BASE_URL } from '@/lib/config';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import SocialPublishModal from '@/components/export/SocialPublishModal';
import { Card, CardContent } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { useArtifacts, QUERY_KEYS } from '@/lib/queries';
import { formatFileSize, formatDate } from '@/lib/utils';
import { useJobsStore, useToastStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';

interface ExportPanelProps {
  project: {
    id: string;
  };
}

interface QCResult {
  overall: 'pass' | 'warning' | 'fail';
  checks: { name: string; passed: boolean; message: string }[];
}

interface Artifact {
  id: string;
  segmentId: string;
  variant: string;
  type: string;
  path: string;
  filename: string;
  size: number;
  createdAt: string;
  description?: string; // JSON: { qc: QCResult } for video artifacts
}

/** Parse QC data stored as JSON in artifact.description */
function parseQC(artifact: Artifact): QCResult | null {
  if (!artifact.description) return null;
  try {
    const parsed = JSON.parse(artifact.description);
    return parsed?.qc ?? null;
  } catch {
    return null;
  }
}

/** Parse published_to metadata stored as JSON in artifact.description */
function parsePublished(
  artifact: Artifact
): { platforms: string[]; publishedAt?: string } | null {
  if (!artifact.description) return null;
  try {
    const parsed = JSON.parse(artifact.description);
    if (parsed?.published_to?.length) {
      return { platforms: parsed.published_to, publishedAt: parsed.published_at };
    }
  } catch {}
  return null;
}

/** QC badge: ✅ pass, ⚠ warning, ✗ fail */
function QCBadge({ qc }: { qc: QCResult }) {
  const config = {
    pass:    { label: 'QC ✓', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
    warning: { label: 'QC ⚠', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    fail:    { label: 'QC ✗', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[qc.overall];

  const tooltip = qc.checks
    .filter((c) => !c.passed)
    .map((c) => c.message)
    .join('\n') || 'Tous les contrôles qualité sont passés';

  return (
    <span
      className={`px-2 py-1 rounded-full text-[10px] font-medium border ${config.cls}`}
      title={tooltip}
    >
      {config.label}
    </span>
  );
}

export default function ExportPanel({ project }: ExportPanelProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [selectedVideo, setSelectedVideo] = useState<Artifact | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [publishingArtifact, setPublishingArtifact] = useState<Artifact | null>(null);
  const [contentByArtifact, setContentByArtifact] = useState<
    Record<string, { title: string; description: string; hashtags: string[] }>
  >({});
  const previousJobStatusRef = useRef<Record<string, string>>({});

  // React Query: fetch artifacts
  const {
    data: artifactsData,
    isLoading: loading,
    isError: artifactsError,
    refetch: refetchArtifacts,
  } = useArtifacts(project.id);

  const artifacts: Artifact[] = (artifactsData?.data || []) as Artifact[];

  // Show error toast when artifacts fail to load
  useEffect(() => {
    if (artifactsError) {
      addToast({
        type: 'error',
        title: 'Erreur de chargement',
        message: 'Impossible de charger les exports.',
      });
    }
  }, [artifactsError, addToast]);

  // Get export jobs for this project via WebSocket-synced store
  const exportJobs = useJobsStore(
    useShallow((state) =>
      state.jobs.filter((j) => j.projectId === project.id && j.type === 'export')
    )
  );

  const activeJob = exportJobs.find((j) => j.status === 'running');

  // Watch for job completion via WebSocket — invalidate artifacts cache
  useEffect(() => {
    exportJobs.forEach((job) => {
      const prevStatus = previousJobStatusRef.current[job.id];
      if (prevStatus === 'running' && job.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifacts(project.id) });
      }
      previousJobStatusRef.current[job.id] = job.status;
    });
  }, [exportJobs, queryClient, project.id]);

  const openInFolder = async (path: string) => {
    if (window.forge) {
      await window.forge.showItem(path);
    }
  };

  // Group artifacts by segment/variant
  const groupedArtifacts = artifacts.reduce((acc, artifact) => {
    const key = `${artifact.segmentId}-${artifact.variant}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(artifact);
    return acc;
  }, {} as Record<string, Artifact[]>);

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* Active export */}
        {activeJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8"
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-viral-medium/10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-viral-medium border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {activeJob.stage || 'Export en cours...'}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {activeJob.message || 'Génération du clip'}
                    </p>
                  </div>
                  <span className="ml-auto text-lg font-bold text-[var(--text-primary)]">
                    {activeJob.progress.toFixed(0)}%
                  </span>
                </div>
                <Progress value={activeJob.progress} />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Export list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Exports ({Object.keys(groupedArtifacts).length})
            </h3>
            <div className="flex items-center gap-2">
              {Object.keys(groupedArtifacts).length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    addToast({
                      type: 'info',
                      title: 'Génération en cours',
                      message: `Contenu pour ${Object.keys(groupedArtifacts).length} clips...`,
                    });
                    const promises = Object.values(groupedArtifacts).map(async (items) => {
                      const video = items.find((a) => a.type === 'video');
                      if (!video) return null;
                      try {
                        const segRes = await api.getSegment(project.id, video.segmentId);
                        const seg = (segRes?.data as any) ?? segRes;
                        const transcript: string =
                          typeof seg?.transcript === 'string'
                            ? seg.transcript
                            : seg?.transcript?.text ?? '';
                        const tags: string[] = seg?.score?.tags ?? seg?.tags ?? [];
                        if (!transcript) return null;
                        return api.generateSegmentContent(transcript, tags, 'tiktok');
                      } catch {
                        return null;
                      }
                    });
                    const results = await Promise.all(promises);
                    const successful = results.filter(Boolean).length;
                    addToast({
                      type: 'success',
                      title: 'Terminé',
                      message: `${successful}/${results.length} contenus générés.`,
                    });
                  }}
                  title="Générer titres/descriptions/hashtags pour tous les exports"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Générer tout
                </Button>
              )}
              <button
                onClick={() => refetchArtifacts()}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-gray-200"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : Object.keys(groupedArtifacts).length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Download className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
                <h4 className="font-medium text-[var(--text-primary)] mb-2">
                  Aucun export
                </h4>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Sélectionnez un segment dans l'onglet Forge et exportez-le
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {Object.entries(groupedArtifacts).map(([key, items], index) => {
                  const video = items.find((a) => a.type === 'video');
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <ExportCard
                        artifacts={items}
                        onOpen={openInFolder}
                        onSelect={setSelectedVideo}
                        isSelected={selectedVideo?.id === video?.id}
                        projectId={project.id}
                        onPreview={(url) => setPreviewUrl(url)}
                        onPublish={(artifact) => setPublishingArtifact(artifact)}
                        onContentGenerated={(artifactId, content) =>
                          setContentByArtifact((prev) => ({
                            ...prev,
                            [artifactId]: content,
                          }))
                        }
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Video Player Modal */}
      <AnimatePresence>
        {selectedVideo && (
          <VideoPlayerModal
            video={selectedVideo}
            projectId={project.id}
            onClose={() => setSelectedVideo(null)}
          />
        )}
      </AnimatePresence>

      {/* Quick Preview Modal (360p preview video) */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="max-w-md aspect-[9/16] bg-black rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <video src={previewUrl} autoPlay loop controls className="w-full h-full" />
          </div>
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Social Publish Modal */}
      {publishingArtifact && (
        <SocialPublishModal
          artifactId={publishingArtifact.id}
          projectId={project.id}
          defaultTitle={
            contentByArtifact[publishingArtifact.id]?.title ??
            publishingArtifact.filename.replace(/\.[^.]+$/, '')
          }
          defaultDescription={contentByArtifact[publishingArtifact.id]?.description ?? ''}
          defaultHashtags={contentByArtifact[publishingArtifact.id]?.hashtags ?? []}
          onClose={() => setPublishingArtifact(null)}
        />
      )}
    </div>
  );
}

interface ContentData {
  titles: string[];
  description: string;
  hashtags: string[];
  hook_suggestion: string | null;
}

function ContentPanel({
  artifact,
  projectId,
  onContentGenerated,
}: {
  artifact: Artifact;
  projectId: string;
  onContentGenerated?: (content: { title: string; description: string; hashtags: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<ContentData | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDesc, setEditedDesc] = useState('');
  const [editedHashtags, setEditedHashtags] = useState('');
  const [similarStats, setSimilarStats] = useState<{ count: number; avg_views: number } | null>(null);
  const { addToast } = useToastStore();

  // Bubble the current edited content up to ExportPanel so SocialPublishModal
  // can prefill title/description/hashtags when the user clicks Publier.
  useEffect(() => {
    if (!onContentGenerated) return;
    if (!content) return;
    onContentGenerated({
      title: editedTitle,
      description: editedDesc,
      hashtags: editedHashtags.split(/\s+/).filter(Boolean),
    });
  }, [editedTitle, editedDesc, editedHashtags, content, onContentGenerated]);

  // Fetch similar-clips stats once the panel is opened
  useEffect(() => {
    if (open && !similarStats) {
      // Simplest: use a default predicted score (70). Real impl could derive from segment.
      api
        .getSimilarStats(70, 'tiktok')
        .then((res) => {
          // Endpoint returns the stats object directly (no ApiResponse wrapper)
          if (res && res.count > 0) {
            setSimilarStats({ count: res.count, avg_views: res.avg_views });
          }
        })
        .catch(() => {});
    }
  }, [open, similarStats]);

  const generate = async () => {
    setLoading(true);
    try {
      // Fetch the segment to get its transcript
      const segRes = await api.getSegment(projectId, artifact.segmentId);
      const segment = segRes?.data as any; // ApiSegment shape

      // Extract transcript text, fallback to joined transcriptSegments words
      const directText: string =
        typeof segment?.transcript === 'string'
          ? segment.transcript
          : segment?.transcript?.text ?? '';

      const wordsList: any[] =
        segment?.transcriptSegments ??
        segment?.transcript?.words ??
        [];

      const transcript: string =
        directText ||
        wordsList.map((w: any) => w.word ?? w.text ?? '').join(' ');

      const tags: string[] = segment?.score?.tags ?? segment?.tags ?? [];

      if (!transcript) {
        addToast({ type: 'warning', title: 'Transcript vide', message: 'Pas de transcription pour ce segment.' });
        setLoading(false);
        return;
      }

      const res = await api.generateSegmentContent(transcript, tags, 'tiktok');
      if (res?.data) {
        setContent(res.data);
        setEditedTitle(res.data.titles[0] ?? '');
        setEditedDesc(res.data.description);
        setEditedHashtags(res.data.hashtags.join(' '));
      }
    } catch (e) {
      console.error('Content generation failed:', e);
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible de générer le contenu.' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast({ type: 'success', title: 'Copié !', message: `${label} copié dans le presse-papier.` });
  };

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button
        className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); if (!open && !content) generate(); }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Contenu de publication</span>
        <span className="ml-1 text-[var(--text-muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <div className="w-3 h-3 border border-viral-medium border-t-transparent rounded-full animate-spin" />
              <span>Génération en cours...</span>
            </div>
          ) : content ? (
            <>
              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Titre</span>
                  <button
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => copyToClipboard(editedTitle, 'Titre')}
                  >
                    Copier
                  </button>
                </div>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                />
                {content.titles.length > 1 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {content.titles.slice(1).map((t, i) => (
                      <button
                        key={i}
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-white/5 rounded px-1.5 py-0.5 truncate max-w-[160px]"
                        onClick={() => setEditedTitle(t)}
                        title={t}
                      >
                        Alt {i + 2}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Description</span>
                  <button
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => copyToClipboard(editedDesc, 'Description')}
                  >
                    Copier
                  </button>
                </div>
                <textarea
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50 resize-none"
                  rows={3}
                  value={editedDesc}
                  onChange={(e) => setEditedDesc(e.target.value)}
                />
              </div>

              {/* Hashtags */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Hashtags (20)</span>
                  <button
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => copyToClipboard(editedHashtags, 'Hashtags')}
                  >
                    Copier tout
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {editedHashtags.split(' ').filter(Boolean).map((h, i) => (
                    <span key={i} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              {similarStats && (
                <div className="mt-2 text-[10px] text-[var(--text-muted)] bg-white/5 rounded px-2 py-1.5 border border-white/5">
                  📊 Clips similaires: ~{similarStats.avg_views.toLocaleString()} vues en moyenne ({similarStats.count} clips)
                </div>
              )}

              <button
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                onClick={generate}
              >
                ↺ Régénérer
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ExportCard({
  artifacts,
  onOpen,
  onSelect,
  isSelected,
  projectId,
  onPreview,
  onPublish,
  onContentGenerated,
}: {
  artifacts: Artifact[];
  onOpen: (path: string) => void;
  onSelect: (video: Artifact) => void;
  isSelected: boolean;
  projectId: string;
  onPreview: (url: string) => void;
  onPublish: (artifact: Artifact) => void;
  onContentGenerated?: (
    artifactId: string,
    content: { title: string; description: string; hashtags: string[] }
  ) => void;
}) {
  const video = artifacts.find((a) => a.type === 'video');
  const cover = artifacts.find((a) => a.type === 'cover');

  if (!video) return null;

  // Use backend API to serve videos (works in both Electron and browser)
  const baseUrl = ENGINE_BASE_URL;
  const videoUrl = `${baseUrl}/v1/projects/${projectId}/artifacts/${video.id}/file`;
  const coverUrl = cover ? `${baseUrl}/v1/projects/${projectId}/artifacts/${cover.id}/file` : null;
  const qc = parseQC(video);
  const published = parsePublished(video);

  return (
    <Card
      className={`hover:shadow-panel-hover transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-500/5' : ''
      }`}
      onClick={() => onSelect(video)}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail with play overlay */}
          <div className="w-28 h-40 bg-[var(--bg-tertiary)] rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden relative group">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={videoUrl}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
              />
            )}
            {/* Play overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play className="w-6 h-6 text-white ml-1" />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-medium text-[var(--text-primary)] truncate">
                  {video.filename}
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Variant {artifacts[0].variant} • {formatFileSize(video.size)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {qc ? (
                  <QCBadge qc={qc} />
                ) : (
                  <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Prêt
                  </span>
                )}
                {published && (
                  <span
                    className="px-2 py-1 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    title={
                      published.publishedAt
                        ? `Publié le ${formatDate(published.publishedAt)}`
                        : 'Déjà publié'
                    }
                  >
                    ✓ Publié{' '}
                    {published.platforms
                      .map((p) =>
                        p === 'tiktok' ? '🎵' : p === 'youtube' ? '▶️' : '📸'
                      )
                      .join(' ')}
                  </span>
                )}
              </div>
            </div>

            {/* Files */}
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-muted)]">
              <span>{artifacts.length} fichiers</span>
              <span>•</span>
              <span>{formatDate(artifacts[0].createdAt)}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(video.path);
                }}
              >
                <FolderOpen className="w-4 h-4 mr-1" />
                Dossier
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(video);
                }}
              >
                <Play className="w-4 h-4 mr-1" />
                Lecture
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await api.generateSegmentPreview(projectId, video.segmentId);
                    if (res?.data?.preview_path) {
                      // Convert file path to URL via backend static file serving
                      const encoded = encodeURIComponent(res.data.preview_path);
                      onPreview(`${ENGINE_BASE_URL}/v1/projects/previews/file?path=${encoded}`);
                    }
                  } catch {
                    // silently ignore
                  }
                }}
                title="Générer un aperçu rapide 360p"
              >
                <Eye className="w-4 h-4 mr-1" />
                Aperçu
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPublish(video);
                }}
                title="Publier sur les réseaux sociaux"
              >
                <Send className="w-4 h-4 mr-1" />
                Publier
              </Button>
            </div>
          </div>
        </div>
        <ContentPanel
          artifact={video}
          projectId={projectId}
          onContentGenerated={
            onContentGenerated
              ? (content) => onContentGenerated(video.id, content)
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}

// Video Player Modal
function VideoPlayerModal({
  video,
  projectId,
  onClose,
}: {
  video: Artifact;
  projectId: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Use backend API to serve videos
  const baseUrl = ENGINE_BASE_URL;
  const videoUrl = `${baseUrl}/v1/projects/${projectId}/artifacts/${video.id}/file`;

  useEffect(() => {
    // Auto-play when modal opens
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTimeDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Video container - 9:16 aspect ratio */}
        <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '9/16' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            muted={isMuted}
            loop
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlay}
          />

          {/* Play/Pause overlay */}
          <AnimatePresence>
            {!isPlaying && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-black/30"
                onClick={togglePlay}
              >
                <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-lg flex items-center justify-center">
                  <Play className="w-10 h-10 text-white ml-2" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            {/* Progress bar */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 mb-3 accent-white cursor-pointer"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white" />
                  )}
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-white" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-white" />
                  )}
                </button>

                <span className="text-xs text-white/70">
                  {formatTimeDisplay(currentTime)} / {formatTimeDisplay(duration)}
                </span>
              </div>

              <div className="text-xs text-white/50 truncate max-w-[150px]">
                {video.filename}
              </div>
            </div>
          </div>
        </div>

        {/* Info bar */}
        <div className="mt-4 flex items-center justify-center gap-4 text-sm text-white/60">
          <span>{formatFileSize(video.size)}</span>
          <span>•</span>
          <span>{formatDate(video.createdAt)}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}




