import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Zap,
  Rocket,
  Edit,
  Play,
  Sparkles,
  FolderOpen,
  Send,
  CheckCircle,
  Loader2,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useJobsStore,
  useToastStore,
  useProjectsStore,
} from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  useProject,
  useSegments,
  useSegmentStats,
  useArtifacts,
  QUERY_KEYS,
} from '@/lib/queries';
import { api } from '@/lib/api';
import { ENGINE_BASE_URL } from '@/lib/config';
import type { ApiProject, ApiSegment } from '@/lib/types';
import VodSpine from '@/components/project/VodSpine';
import IngestPanel from '@/components/project/IngestPanel';
import AnalyzePanel from '@/components/project/AnalyzePanel';
import ProgressOverlay from '@/components/project/ProgressOverlay';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface SpineSegmentLite {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  transcript?: string;
  tags?: string[];
  topicLabel?: string;
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
  description?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDurationHuman(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}`;
  return `${m} min`;
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return '#EF4444';
  if (score >= 80) return '#F59E0B';
  if (score >= 70) return '#22C55E';
  if (score >= 60) return '#3B82F6';
  return '#6B7280';
}

function getChannelLabel(project: ApiProject | null): string {
  if (!project) return 'VOD';
  const meta = (project.metadata ?? {}) as Record<string, unknown>;
  const raw =
    (meta.channel_name as string | undefined) ??
    (meta.channelName as string | undefined) ??
    (meta.uploader as string | undefined) ??
    (meta.source_type as string | undefined) ??
    (meta.sourceType as string | undefined);
  if (raw && typeof raw === 'string') return raw;
  // Fallback: show source filename's first chunk for local imports
  if (project.sourceFilename) {
    return project.sourceFilename
      .replace(/\.[^.]+$/, '')
      .slice(0, 36);
  }
  return 'VOD';
}

function getSourceHint(project: ApiProject | null): string {
  if (!project) return '';
  const meta = (project.metadata ?? {}) as Record<string, unknown>;
  const url =
    (meta.source_url as string | undefined) ??
    (meta.sourceUrl as string | undefined);
  if (url && typeof url === 'string') return url;
  return project.sourcePath ?? '';
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-16 mb-6 px-12">
      <div className="flex items-baseline justify-between mb-2 gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-white">
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {meta && (
            <span className="text-xs text-white/40 uppercase tracking-wider">
              {meta}
            </span>
          )}
          {action}
        </div>
      </div>
      <div className="w-full h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------

function ProjectHero({
  project,
  stats,
  segmentsCount,
  onReview,
  onTopTikTok,
  onEditor,
  onBack,
}: {
  project: ApiProject;
  stats: {
    avgScore?: number;
    topScore?: number;
    total?: number;
  };
  segmentsCount: number;
  onReview: () => void;
  onTopTikTok: () => void;
  onEditor: () => void;
  onBack: () => void;
}) {
  const proxyUrl = `${ENGINE_BASE_URL}/v1/projects/${project.id}/media/proxy`;
  // Poster: mid-point thumbnail
  const posterUrl = `${ENGINE_BASE_URL}/v1/projects/${project.id}/thumbnail?time=${(project.duration || 60) / 2}&width=1920&height=1080`;
  const hasMedia = !!project.proxyPath;
  const channel = getChannelLabel(project);
  const hint = getSourceHint(project);

  return (
    <div className="relative w-full min-h-[72vh] flex items-end p-12 overflow-hidden isolate">
      {/* Backdrop */}
      {hasMedia ? (
        <>
          <video
            key={project.id}
            src={proxyUrl}
            poster={posterUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-40 blur-md scale-110"
            muted
            autoPlay
            loop
            playsInline
          />
        </>
      ) : (
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at top left, rgba(245,158,11,0.25), transparent 60%), radial-gradient(ellipse at bottom right, rgba(59,130,246,0.18), transparent 65%)',
          }}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0F]/70 via-transparent to-transparent" />

      {/* Back button top-left */}
      <button
        onClick={onBack}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 backdrop-blur hover:bg-black/60 text-white/80 hover:text-white text-sm transition-colors"
        title="Retour"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Retour</span>
      </button>

      {/* Content */}
      <div className="relative z-10 max-w-4xl w-full">
        <div className="text-xs sm:text-sm text-white/50 uppercase tracking-[0.25em] mb-3 font-semibold">
          {channel}
        </div>
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-5 leading-[1.05] tracking-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.55)]">
          {project.name || 'Untitled'}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70 mb-8">
          {project.duration != null && project.duration > 0 && (
            <span>{formatDurationHuman(project.duration)}</span>
          )}
          {segmentsCount > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span>{segmentsCount} segments</span>
            </>
          )}
          {stats?.topScore != null && stats.topScore > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span>
                Top score{' '}
                <span className="text-viral-medium font-bold">
                  {Math.round(stats.topScore)}
                </span>
              </span>
            </>
          )}
          {stats?.avgScore != null && stats.avgScore > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span>
                Moyenne{' '}
                <span className="text-white font-semibold">
                  {Math.round(stats.avgScore)}
                </span>
              </span>
            </>
          )}
          {project.createdAt && (
            <>
              <span className="text-white/20">·</span>
              <span>{formatShortDate(project.createdAt)}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onReview}
            className="bg-gradient-to-r from-viral-medium to-viral-high !text-black font-semibold shadow-lg"
          >
            <Zap className="w-5 h-5 mr-2" />
            Review Mode
          </Button>
          <Button variant="secondary" size="lg" onClick={onTopTikTok}>
            <Rocket className="w-5 h-5 mr-2" />
            Top 3 TikTok rapide
          </Button>
          <Button variant="secondary" size="lg" onClick={onEditor}>
            <Edit className="w-5 h-5 mr-2" />
            Éditeur
          </Button>
        </div>

        {hint && (
          <div className="mt-8 text-[11px] text-white/30 font-mono truncate max-w-2xl">
            {hint}
          </div>
        )}
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-[0.3em] uppercase animate-bounce select-none pointer-events-none">
        scroll
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOP SEGMENTS — horizontal carousel
// ---------------------------------------------------------------------------

function TopSegmentsCarousel({
  segments,
  projectId,
  onExtract,
  onOpen,
}: {
  segments: SpineSegmentLite[];
  projectId: string;
  onExtract: (seg: SpineSegmentLite) => void;
  onOpen: (seg: SpineSegmentLite) => void;
}) {
  const top = useMemo(
    () =>
      segments
        .filter((s) => s.score >= 75)
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    [segments],
  );

  if (top.length === 0) {
    return (
      <div className="px-12 pb-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-sm text-white/40">
          Aucun segment au-dessus du score 75 pour l'instant. Les meilleurs
          clips apparaîtront ici dès que l'analyse sera finalisée.
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-12 pb-4 scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {top.map((seg, i) => {
          const videoUrl = `${ENGINE_BASE_URL}/v1/projects/${projectId}/media/proxy#t=${seg.startTime},${seg.endTime}`;
          const color = scoreColor(seg.score);
          return (
            <motion.div
              key={seg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="snap-start flex-shrink-0 w-[220px] group relative rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-colors"
              style={{ height: 390 }}
              onClick={() => onOpen(seg)}
            >
              <video
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                preload="metadata"
                playsInline
                onMouseEnter={(e) => {
                  const v = e.currentTarget;
                  v.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  const v = e.currentTarget;
                  v.pause();
                  v.currentTime = seg.startTime;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />

              {/* Rank */}
              <div
                className="absolute top-3 left-3 text-4xl font-bold text-white/90 tracking-tighter leading-none pointer-events-none"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
              >
                {i + 1}
              </div>

              {/* Score badge */}
              <div
                className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold pointer-events-none"
                style={{
                  backgroundColor: `${color}33`,
                  color,
                  border: `1px solid ${color}`,
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              >
                {Math.round(seg.score)}
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-0 inset-x-0 p-4 text-white">
                {seg.topicLabel && (
                  <p className="text-xs font-semibold mb-1.5 line-clamp-1 drop-shadow">
                    {seg.topicLabel}
                  </p>
                )}
                {seg.transcript && (
                  <p className="text-[11px] line-clamp-2 opacity-80 mb-2 italic">
                    "{seg.transcript.slice(0, 90)}…"
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExtract(seg);
                  }}
                  className="w-full py-2 rounded-lg bg-white/10 backdrop-blur hover:bg-viral-medium hover:text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  Extraire TikTok
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ALL SEGMENTS — responsive grid
// ---------------------------------------------------------------------------

function AllSegmentsGrid({
  segments,
  projectId,
  onSelect,
  onExtract,
}: {
  segments: SpineSegmentLite[];
  projectId: string;
  onSelect: (seg: SpineSegmentLite) => void;
  onExtract: (seg: SpineSegmentLite) => void;
}) {
  if (segments.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-white/40">
        Aucun segment à afficher.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {segments.map((seg, i) => {
        const color = scoreColor(seg.score);
        const thumb = `${ENGINE_BASE_URL}/v1/projects/${projectId}/thumbnail?time=${Math.max(
          0,
          seg.startTime + 1,
        )}&width=480&height=270`;
        return (
          <motion.div
            key={seg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.4) }}
            onClick={() => onSelect(seg)}
            className="group relative rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/25 bg-white/[0.02] transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
          >
            <div className="relative aspect-video bg-black/60">
              <img
                src={thumb}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div
                className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: `${color}33`,
                  color,
                  border: `1px solid ${color}55`,
                }}
              >
                {Math.round(seg.score)}
              </div>
              <div className="absolute bottom-2 left-2 text-[10px] font-mono text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
                {Math.round(seg.duration)}s
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/30">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </div>
              </div>
            </div>

            <div className="p-3">
              <div className="text-xs font-semibold text-white truncate">
                {seg.topicLabel || 'Segment'}
              </div>
              {seg.transcript && (
                <div className="text-[11px] text-white/50 italic line-clamp-2 mt-1">
                  "{seg.transcript.slice(0, 80)}"
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExtract(seg);
                }}
                className="mt-2 w-full py-1.5 rounded-md text-[11px] font-semibold bg-white/5 hover:bg-viral-medium hover:text-black text-white/80 transition-colors flex items-center justify-center gap-1"
              >
                <Rocket className="w-3 h-3" />
                TikTok
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EXPORTS RAIL
// ---------------------------------------------------------------------------

function parseQC(
  artifact: Artifact,
): { overall: 'pass' | 'warning' | 'fail' } | null {
  if (!artifact.description) return null;
  try {
    const parsed = JSON.parse(artifact.description);
    if (parsed?.qc?.overall) return parsed.qc;
  } catch {}
  return null;
}

function parsePublished(artifact: Artifact): { platforms: string[] } | null {
  if (!artifact.description) return null;
  try {
    const parsed = JSON.parse(artifact.description);
    if (parsed?.published_to?.length) {
      return { platforms: parsed.published_to };
    }
  } catch {}
  return null;
}

function ExportsRail({
  projectId,
  artifacts,
  loading,
  onRefresh,
  onPublish,
}: {
  projectId: string;
  artifacts: Artifact[];
  loading: boolean;
  onRefresh: () => void;
  onPublish: (a: Artifact) => void;
}) {
  // Group by segment+variant; keep the video artifact as anchor
  const grouped = useMemo(() => {
    const map: Record<string, Artifact[]> = {};
    for (const a of artifacts) {
      const key = `${a.segmentId}-${a.variant}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return Object.values(map);
  }, [artifacts]);

  const openInFolder = async (path: string) => {
    const forge = (window as unknown as { forge?: { showItem?: (p: string) => Promise<void> } })
      .forge;
    if (forge?.showItem) {
      await forge.showItem(path);
    }
  };

  if (loading) {
    return (
      <div className="flex gap-4 px-12 pb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-[200px] h-[356px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="px-12 pb-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-sm text-white/40 flex items-center justify-between">
          <span>
            Pas encore de clip exporté. Lancez un extract depuis les segments
            ci-dessus ou passez en Review Mode.
          </span>
          <button
            onClick={onRefresh}
            className="ml-3 flex-shrink-0 px-2 py-1 rounded hover:bg-white/5 text-white/60 text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-12 pb-4 scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {grouped.map((group, i) => {
          const video = group.find((a) => a.type === 'video');
          const cover = group.find((a) => a.type === 'cover');
          const thumb = group.find((a) => a.type === 'thumbnail');
          if (!video) return null;
          const videoUrl = `${ENGINE_BASE_URL}/v1/projects/${projectId}/artifacts/${video.id}/file`;
          const thumbUrl = thumb
            ? `${ENGINE_BASE_URL}/v1/projects/${projectId}/artifacts/${thumb.id}/file`
            : cover
              ? `${ENGINE_BASE_URL}/v1/projects/${projectId}/artifacts/${cover.id}/file`
              : null;
          const qc = parseQC(video);
          const published = parsePublished(video);
          return (
            <motion.div
              key={video.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className="snap-start flex-shrink-0 w-[200px] group relative rounded-xl overflow-hidden cursor-default border border-white/5 hover:border-white/20 bg-black/40 transition-colors"
              style={{ height: 356 }}
            >
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <video
                  src={videoUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted
                  preload="metadata"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

              {/* QC badge */}
              <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                {qc && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                      qc.overall === 'pass'
                        ? 'bg-green-500/20 text-green-300 border-green-500/40'
                        : qc.overall === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                          : 'bg-red-500/20 text-red-300 border-red-500/40'
                    }`}
                  >
                    QC {qc.overall === 'pass' ? '✓' : qc.overall === 'warning' ? '⚠' : '✗'}
                  </span>
                )}
                {!qc && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/40 flex items-center gap-0.5">
                    <CheckCircle className="w-2.5 h-2.5" />
                    Prêt
                  </span>
                )}
                {published && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    ✓ {published.platforms.length}
                  </span>
                )}
              </div>

              {/* Variant tag */}
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/60 text-white/80">
                {video.variant}
              </div>

              {/* Bottom actions */}
              <div className="absolute bottom-0 inset-x-0 p-3">
                <div className="text-[11px] text-white/80 truncate mb-2" title={video.filename}>
                  {video.filename}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onPublish(video)}
                    className="flex-1 py-1.5 rounded-md bg-viral-medium/90 hover:bg-viral-medium text-black text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Publier"
                  >
                    <Send className="w-3 h-3" />
                    Publier
                  </button>
                  <button
                    onClick={() => openInFolder(video.path)}
                    className="px-2 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-[11px] flex items-center justify-center transition-colors"
                    title="Ouvrir dans le dossier"
                  >
                    <FolderOpen className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PIPELINE PROGRESS (compact) — promoted to top when analysis not done
// ---------------------------------------------------------------------------

function PipelineProgress({
  project,
  onJobStart,
  onComplete,
}: {
  project: ApiProject;
  onJobStart: (id: string, type: 'ingest' | 'analyze') => void;
  onComplete: () => void;
}) {
  const isIngested = ['ingested', 'analyzing', 'analyzed', 'ready'].includes(
    project.status,
  );
  const isAnalyzed = ['analyzed', 'ready'].includes(project.status);

  // Show the two matching panels inline (they already expose their own
  // minimal UI and progress). We wrap them with a shared cinematic shell.
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {!isIngested && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-viral-medium" />
            <span className="text-sm font-semibold text-white">
              Étape 1 — Ingest
            </span>
          </div>
          <div className="p-1">
            <IngestPanel
              project={project as ApiProject & { audioTracks: number }}
              onJobStart={(id) => onJobStart(id, 'ingest')}
              onComplete={onComplete}
            />
          </div>
        </div>
      )}

      {!isAnalyzed && isIngested && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-viral-high" />
            <span className="text-sm font-semibold text-white">
              Étape 2 — Analyse
            </span>
          </div>
          <div className="p-1">
            <AnalyzePanel
              project={project}
              onJobStart={(id) => onJobStart(id, 'analyze')}
              onComplete={onComplete}
            />
          </div>
        </div>
      )}

      {isAnalyzed && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-sm text-white/60 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-viral-high" />
          Pipeline terminé. Tout est prêt à être forgé.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const previousJobStatusRef = useRef<Record<string, string>>({});
  const [renameSuggestionShown, setRenameSuggestionShown] = useState(false);

  // --- Data -----------------------------------------------------------------
  const { data: projectResponse, isLoading, isError } = useProject(id);
  const project: ApiProject | null = projectResponse?.data ?? null;

  const { data: segmentsData, isLoading: segmentsLoading } = useSegments(
    id ?? '',
    { sortBy: 'score', pageSize: 100 },
  );
  const segments: ApiSegment[] = segmentsData?.data?.items ?? [];

  const { data: statsData } = useSegmentStats(id ?? '');
  const stats = statsData?.data;

  const { data: artifactsData, isLoading: artifactsLoading, refetch: refetchArtifacts } =
    useArtifacts(id ?? '');
  const artifacts = (artifactsData?.data ?? []) as Artifact[];

  // --- Derived --------------------------------------------------------------
  const spineSegments: SpineSegmentLite[] = useMemo(() => {
    return segments.map((s) => {
      const rawScore: number =
        (s.score && typeof s.score === 'object'
          ? (s.score.total as number | undefined)
          : undefined) ??
        ((s as unknown as { scoreTotal?: number }).scoreTotal ?? 0);
      const transcript =
        typeof s.transcript === 'string'
          ? s.transcript
          : ((s.transcript as unknown as { text?: string })?.text ?? undefined);
      const tags =
        (s.score && typeof s.score === 'object' && Array.isArray(s.score.tags))
          ? s.score.tags
          : ((s as unknown as { tags?: string[] }).tags ?? []);
      return {
        id: s.id,
        startTime: s.startTime ?? 0,
        endTime: s.endTime ?? 0,
        duration: s.duration ?? (s.endTime ?? 0) - (s.startTime ?? 0),
        score: rawScore,
        transcript,
        tags,
        topicLabel: s.topicLabel,
      };
    });
  }, [segments]);

  const vodDuration = useMemo(() => {
    if (project?.duration && project.duration > 0) return project.duration;
    if (spineSegments.length === 0) return 0;
    return Math.max(...spineSegments.map((s) => s.endTime));
  }, [project?.duration, spineSegments]);

  // Top segments show at top; the grid below excludes those to avoid duplicate
  const remainingSegments = useMemo(() => {
    const topIds = new Set(
      spineSegments
        .filter((s) => s.score >= 75)
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((s) => s.id),
    );
    return spineSegments.filter((s) => !topIds.has(s.id));
  }, [spineSegments]);

  // --- WebSocket / jobs sync ------------------------------------------------
  const projectJobs = useJobsStore(
    useShallow((state) => state.jobs.filter((j) => j.projectId === id)),
  );

  const storeProject = useProjectsStore(
    useShallow((state) => state.projects.find((p) => p.id === id)),
  );

  const refreshProject = () => {
    if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.project(id) });
  };

  const refreshArtifacts = () => {
    if (id)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifacts(id) });
  };

  // Navigate away on fetch error
  useEffect(() => {
    if (isError) {
      addToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de charger le projet',
      });
      navigate('/');
    }
  }, [isError, addToast, navigate]);

  // Refresh caches on job completion
  useEffect(() => {
    projectJobs.forEach((job) => {
      const prevStatus = previousJobStatusRef.current[job.id];
      const wasNotComplete =
        !prevStatus || prevStatus === 'running' || prevStatus === 'pending';
      if (wasNotComplete && job.status === 'completed') {
        refreshProject();
        if (job.type === 'export') {
          refreshArtifacts();
        }
      }
      previousJobStatusRef.current[job.id] = job.status;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectJobs]);

  // Sync store-pushed project status change
  useEffect(() => {
    if (storeProject && project && storeProject.status !== project.status) {
      refreshProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeProject?.status]);

  // Post-analyze rename suggestion
  useEffect(() => {
    if (!project?.id || renameSuggestionShown) return;
    const analyzeJob = projectJobs.find(
      (j) => j.type === 'analyze' && j.status === 'completed',
    );
    if (!analyzeJob) return;

    setRenameSuggestionShown(true);
    api
      .suggestProjectRename(project.id)
      .then((res: unknown) => {
        const res0 = res as { data?: { suggestion?: string | null; current_name?: string }; suggestion?: string | null; current_name?: string };
        const suggestion = res0?.data?.suggestion ?? res0?.suggestion;
        const currentName = res0?.data?.current_name ?? res0?.current_name;
        if (suggestion && suggestion !== currentName) {
          addToast({
            type: 'info',
            title: 'Suggestion de renommage',
            message: `"${suggestion}" — cliquez Paramètres > Renommer pour appliquer.`,
            duration: 8000,
          });
        }
      })
      .catch(() => {
        /* non-blocking */
      });
  }, [projectJobs, project?.id, renameSuggestionShown, addToast]);

  // --- Handlers -------------------------------------------------------------
  const handleExtract = async (seg: SpineSegmentLite) => {
    if (!id) return;
    try {
      const res = await api.exportSegment(id, {
        segmentId: seg.id,
        platform: 'tiktok',
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: true,
        includeMetadata: true,
      });
      if (res?.data?.jobId) {
        addToast({
          type: 'success',
          title: 'Export TikTok lancé',
          message: 'Le clip sera prêt dans quelques instants.',
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erreur inconnue.';
      addToast({
        type: 'error',
        title: 'Export échoué',
        message: `Impossible de lancer l'export. ${detail}`,
      });
    }
  };

  const handleOpenSegment = (seg: SpineSegmentLite) => {
    if (!id) return;
    navigate(`/editor/${id}?segment=${seg.id}`);
  };

  const handleTopTikTok = async () => {
    if (!id || !project) return;
    try {
      const res = await api.batchExportAll(id, {
        minScore: 75,
        maxClips: 3,
        style: 'viral_pro',
        platform: 'tiktok',
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: true,
        includeMetadata: true,
        useNvenc: true,
      });
      if (res?.data?.jobId) {
        addToast({
          type: 'success',
          title: 'Top 3 TikTok',
          message: `${res.data.willExport ?? 3} clips en cours d'export.`,
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erreur inconnue.';
      addToast({
        type: 'error',
        title: 'Top TikTok échoué',
        message: detail,
      });
    }
  };

  const handlePublish = async (a: Artifact) => {
    if (!id || !project) return;
    // Best-effort one-click publish: fire off to the first connected social
    // account if available; otherwise just navigate to the editor for the
    // segment where the full publish modal is available.
    try {
      const status = await api.getSocialStatus();
      const platform = status.connected_accounts?.[0];
      if (!platform) {
        addToast({
          type: 'info',
          title: 'Aucun compte connecté',
          message:
            'Connectez un réseau social dans les paramètres pour publier en un clic.',
        });
        return;
      }
      await api.publishArtifactToSocial({
        artifactId: a.id,
        projectId: id,
        platform,
        title: a.filename.replace(/\.[^.]+$/, ''),
      });
      addToast({
        type: 'success',
        title: 'Publication envoyée',
        message: `Clip publié sur ${platform}.`,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erreur inconnue.';
      addToast({
        type: 'error',
        title: 'Publication échouée',
        message: detail,
      });
    }
  };

  const handleJobStart = (jobId: string, type: 'ingest' | 'analyze') => {
    if (!id) return;
    useJobsStore.getState().addJob({
      id: jobId,
      type,
      projectId: id,
      status: 'running',
      progress: 0,
    });
  };

  // --- Loading --------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="h-full w-full bg-[#0A0A0F] text-white">
        <div className="min-h-[60vh] w-full flex flex-col gap-4 p-12 justify-end">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex gap-3 mt-4">
            <Skeleton className="h-12 w-40 rounded-lg" />
            <Skeleton className="h-12 w-40 rounded-lg" />
          </div>
        </div>
        <div className="px-12 pb-12 space-y-6">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const pipelineIncomplete = !['analyzed', 'ready'].includes(project.status);
  const hasActiveJob = projectJobs.some((j) => j.status === 'running');

  // --- Render ---------------------------------------------------------------
  return (
    <div className="h-full overflow-y-auto bg-[#0A0A0F] text-white">
      {hasActiveJob && <ProgressOverlay projectId={id!} />}

      {/* HERO */}
      <ProjectHero
        project={project}
        stats={{
          avgScore: stats?.avgScore,
          topScore: stats?.maxScore,
          total: stats?.total ?? segments.length,
        }}
        segmentsCount={stats?.total ?? segments.length}
        onReview={() => navigate(`/review/${project.id}`)}
        onTopTikTok={handleTopTikTok}
        onEditor={() => navigate(`/editor/${project.id}`)}
        onBack={() => navigate('/')}
      />

      {/* When pipeline isn't done yet, promote the controls right under the hero */}
      {pipelineIncomplete && (
        <section>
          <SectionHeader
            title="Pipeline"
            meta="En cours…"
            action={
              <div className="flex items-center gap-1 text-xs text-white/40">
                <Settings className="w-3.5 h-3.5" />
                <span>Auto</span>
              </div>
            }
          />
          <div className="px-12 pb-6">
            <PipelineProgress
              project={project}
              onJobStart={handleJobStart}
              onComplete={refreshProject}
            />
          </div>
        </section>
      )}

      {/* TIMELINE */}
      {(spineSegments.length > 0 || segmentsLoading) && (
        <section>
          <SectionHeader
            title="Timeline"
            meta={`${spineSegments.length} moments détectés`}
          />
          <div className="px-12 pb-4">
            {vodDuration > 0 && spineSegments.length > 0 ? (
              <VodSpine
                segments={spineSegments.map((s) => ({
                  id: s.id,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  score: s.score,
                  transcript: s.transcript,
                  tags: s.tags,
                }))}
                duration={vodDuration}
                onSegmentClick={(seg) => {
                  const full = spineSegments.find((s) => s.id === seg.id);
                  if (full) handleOpenSegment(full);
                }}
                height={300}
              />
            ) : (
              <Skeleton className="h-[220px] w-full rounded-xl" />
            )}
          </div>
        </section>
      )}

      {/* TOP SEGMENTS */}
      {spineSegments.length > 0 && (
        <section>
          <SectionHeader title="Top moments" meta="Score ≥ 75" />
          <TopSegmentsCarousel
            segments={spineSegments}
            projectId={project.id}
            onExtract={handleExtract}
            onOpen={handleOpenSegment}
          />
        </section>
      )}

      {/* ALL SEGMENTS */}
      {remainingSegments.length > 0 && (
        <section>
          <SectionHeader
            title="Tous les segments"
            meta={`${segments.length} au total`}
          />
          <div className="px-12 pb-16">
            <AllSegmentsGrid
              segments={remainingSegments}
              projectId={project.id}
              onSelect={handleOpenSegment}
              onExtract={handleExtract}
            />
          </div>
        </section>
      )}

      {/* EXPORTS */}
      <section>
        <SectionHeader
          title="Clips exportés"
          meta={`${artifacts.filter((a) => a.type === 'video').length} prêts`}
          action={
            <button
              onClick={() => refetchArtifacts()}
              className="px-2 py-1 rounded hover:bg-white/5 text-white/60 text-xs flex items-center gap-1"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${artifactsLoading ? 'animate-spin' : ''}`}
              />
              Actualiser
            </button>
          }
        />
        <ExportsRail
          projectId={project.id}
          artifacts={artifacts}
          loading={artifactsLoading}
          onRefresh={() => refetchArtifacts()}
          onPublish={handlePublish}
        />
      </section>

      {/* Pipeline controls at the very bottom when already analyzed — acts as system drawer */}
      {!pipelineIncomplete && (
        <section className="pb-24">
          <SectionHeader
            title="Système"
            meta="Pipeline terminé"
            action={
              <span className="flex items-center gap-1 text-xs text-viral-high">
                <CheckCircle className="w-3.5 h-3.5" />
                Prêt
              </span>
            }
          />
          <div className="px-12 pb-12">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-sm text-white/60">
              Le projet a été entièrement analysé. Utilisez le mode Review ou
              l'éditeur pour produire les clips définitifs.
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/review/${project.id}`)}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Lancer Review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTopTikTok}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Relancer Top 3 TikTok
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Empty states / errors -- keep the page exiting cleanly */}
      <AnimatePresence />
    </div>
  );
}
