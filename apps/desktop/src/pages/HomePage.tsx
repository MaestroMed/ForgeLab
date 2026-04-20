import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ENGINE_BASE_URL } from '@/lib/config';
import {
  Search,
  Link2,
  Upload,
  MoreVertical,
  Play,
  Trash2,
  FolderOpen as FolderIcon,
  Pin,
  Zap,
  Layers,
  Film,
} from 'lucide-react';
import InlineUrlBar from '@/components/import/InlineUrlBar';
import OneClickModal from '@/components/import/OneClickModal';
import { api } from '@/lib/api';
import { useProjects, QUERY_KEYS } from '@/lib/queries';
import { useToastStore, useJobsStore, useProjectsStore } from '@/store';
import { useUrlPasteDetector } from '@/hooks/useUrlPasteDetector';

interface Project {
  id: string;
  name: string;
  sourceFilename: string;
  duration?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  thumbnailPath?: string;
  segmentsCount?: number;
  averageScore?: number;
  /** True when the user has pinned this project to the top of the list. */
  isPinned?: boolean;
  // Optional enrichment fields surfaced when available
  channelName?: string;
  sourceType?: string;
  artifactCount?: number;
  segmentCount?: number;
}

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const { addJob } = useJobsStore();
  const { projects: storeProjects, setProjects: setStoreProjects } = useProjectsStore();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [pastedUrl, setPastedUrl] = useState<string | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const [showOneClick, setShowOneClick] = useState(false);
  const [oneClickUrl, setOneClickUrl] = useState<string | undefined>(undefined);

  // Auto-detect video URLs pasted anywhere on the page and open the import modal
  useUrlPasteDetector((url) => {
    setPastedUrl(url);
    setUrlModalOpen(true);
  });

  // Multi-VOD drag-drop: Electron exposes `file.path` on the File object
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files.filter((f) =>
      /\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i.test(f.name)
    );
    if (videoFiles.length === 0) return;

    addToast({
      type: 'info',
      title: 'Import multi-VOD',
      message: `${videoFiles.length} fichier${videoFiles.length > 1 ? 's' : ''} en file d'attente.`,
    });

    for (const file of videoFiles) {
      try {
        const name = file.name.replace(/\.[^.]+$/, '');
        // Electron sets `path` on File; browser drag-drop doesn't
        const path = (file as File & { path?: string }).path;
        if (!path) continue;
        const projectRes = await api.createProject(name, path);
        const project = projectRes?.data;
        if (project?.id) {
          const ingestRes = await api.ingestProject(project.id, {
            createProxy: true,
            extractAudio: true,
            normalizeAudio: true,
            autoAnalyze: true,
          });
          if (ingestRes?.data?.jobId) {
            addJob({
              id: ingestRes.data.jobId,
              type: 'ingest',
              projectId: project.id,
              status: 'running',
              progress: 0,
              stage: 'Démarrage...',
            });
          }
        }
      } catch (err) {
        console.error('Failed to import', file.name, err);
      }
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
  };

  // React Query: fetch projects
  const { data: projectsData, isLoading: loading, isError: projectsError } = useProjects(search || undefined);
  const rawProjects: Project[] = (projectsData?.data?.items || []) as Project[];

  // Always surface pinned projects first — server already orders this way,
  // but sorting client-side keeps optimistic updates stable when toggling.
  // Memoized to keep a stable reference across renders (prevents
  // infinite-loop in downstream useEffects).
  const projects: Project[] = useMemo(
    () =>
      [...rawProjects].sort((a, b) => {
        const pa = a.isPinned ? 1 : 0;
        const pb = b.isPinned ? 1 : 0;
        return pb - pa;
      }),
    [rawProjects],
  );

  // Split pinned vs other for the filmstrip sections
  const pinnedProjects = useMemo(() => projects.filter((p) => p.isPinned), [projects]);
  const otherProjects = useMemo(() => projects.filter((p) => !p.isPinned), [projects]);

  // Dashboard stats (graceful fallback to local data when fields missing)
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        const res: any = await api.getAnalyticsOverview();
        return res?.data ?? res;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  // Show error toast when projects fail to load
  useEffect(() => {
    if (projectsError) {
      addToast({
        type: 'error',
        title: 'Erreur de chargement',
        message: 'Impossible de charger les projets. Vérifiez que le serveur est démarré.',
      });
    }
  }, [projectsError, addToast]);

  // Sync to global store for WebSocket updates compatibility.
  // Guard: only write when the list actually changed (by id+length) to avoid
  // a feedback loop with the invalidate-on-lastUpdate effect below.
  useEffect(() => {
    if (projects.length === 0) return;
    const storeIds = storeProjects.map((p) => p.id).join('|');
    const currentIds = projects.map((p) => p.id).join('|');
    if (storeIds !== currentIds) {
      setStoreProjects(projects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Keyword shortcuts
  useHotkeys('ctrl+i, meta+i', () => handleImport(), { preventDefault: true });
  useHotkeys('ctrl+u, meta+u', () => setUrlModalOpen(true), { preventDefault: true });

  // Command palette (Ctrl+K) can dispatch a custom event to open URL import.
  useEffect(() => {
    const openUrl = () => setUrlModalOpen(true);
    window.addEventListener('forge:open-url-import', openUrl);
    return () => window.removeEventListener('forge:open-url-import', openUrl);
  }, []);

  // Command palette / other callers can dispatch this to open the one-click modal.
  useEffect(() => {
    const openOneClick = (ev: Event) => {
      const detail = (ev as CustomEvent<{ url?: string }>).detail;
      setOneClickUrl(detail?.url);
      setShowOneClick(true);
    };
    window.addEventListener('forge:open-oneclick', openOneClick);
    return () => window.removeEventListener('forge:open-oneclick', openOneClick);
  }, []);

  const handleImport = async () => {
    if (!window.forge) {
      addToast({ type: 'error', title: 'Erreur', message: 'Fonctionnalité non disponible' });
      return;
    }

    setImporting(true);
    try {
      const filePath = await window.forge.openFile();
      if (!filePath) {
        setImporting(false);
        return;
      }

      // Create project
      const fileName = filePath.split(/[\\/]/).pop() || 'Sans titre';
      const projectName = fileName.replace(/\.[^.]+$/, '');

      const createResponse = await api.createProject(projectName, filePath);
      const project = createResponse.data;

      if (!project) {
        throw new Error('Failed to create project');
      }

      addToast({
        type: 'success',
        title: 'Projet créé',
        message: `"${projectName}" a été importé`,
      });

      // Invalidate projects cache
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });

      // Start ingest with sensible defaults so IngestPanel settings carry through
      const ingestResponse = await api.ingestProject(project.id, {
        createProxy: true,
        extractAudio: true,
        normalizeAudio: true,
        autoAnalyze: true,
      });

      if (ingestResponse.data?.jobId) {
        addJob({
          id: ingestResponse.data.jobId,
          type: 'ingest',
          projectId: project.id,
          status: 'running',
          progress: 0,
          stage: 'Démarrage...',
        });
      }

      // Navigate to project
      navigate(`/project/${project.id}`);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Erreur d\'importation',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setImporting(false);
    }
  };

  // Common handlers shared with the filmstrip cards
  const handleOpenProject = (p: Project) => navigate(`/project/${p.id}`);

  const handlePinProject = async (p: Project) => {
    try {
      await api.pinProject(p.id, !p.isPinned);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : "Impossible d'épingler le projet",
      });
    }
  };

  const handleDeleteProject = async (p: Project) => {
    if (!confirm(`Supprimer le projet "${p.name}" ?`)) return;
    try {
      await api.request(`/projects/${p.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
      addToast({ type: 'success', title: 'Projet supprimé', message: p.name });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'Échec de la suppression' });
    }
  };

  // Aggregate stat values with graceful fallbacks
  const clipsValue = stats?.total_clips ?? stats?.totalClips ?? stats?.clips_this_month ?? 0;
  const topScoreRaw =
    stats?.top_score ??
    stats?.topScore ??
    Math.round(projects.reduce((m, p) => Math.max(m, p.averageScore ?? 0), 0));
  const topScoreValue: string | number = topScoreRaw && topScoreRaw > 0 ? Math.round(topScoreRaw) : '—';

  return (
    <div
      className="min-h-full flex flex-col relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the window (relatedTarget null) to avoid flicker over children
        if (!e.relatedTarget) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Cinematic vignette & grain layers above the starfield but behind content */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(0, 212, 255, 0.06) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(255, 120, 0, 0.05) 0%, transparent 60%)',
        }}
      />

      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div
              className="absolute inset-6 border-4 border-dashed border-viral-medium rounded-3xl"
              style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
            />
            <div className="absolute inset-0 bg-viral-medium/5 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="relative z-10 text-center"
            >
              <div className="text-8xl mb-4">📥</div>
              <h2 className="text-4xl font-bold text-white">Lâchez vos VODs</h2>
              <p className="text-sm text-white/60 mt-2">
                MP4, MKV, MOV, WebM, AVI, FLV, WMV
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <header className="relative z-10 px-12 pt-16 pb-8">
        <div className="flex items-start justify-between gap-10 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">
              The Forge Floor
            </div>
            <h1 className="text-6xl font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              FORGE LAB
            </h1>
            <p className="text-sm text-white/50 mt-3 max-w-md">
              Transforme tes VODs en clips viraux. Pipeline IA end-to-end.
            </p>
          </div>

          {/* Stats strip */}
          <div className="flex items-start gap-8">
            <StatBlock label="Projets" value={projects.length} />
            <StatBlock label="Clips" value={clipsValue} />
            <StatBlock label="Top score" value={topScoreValue} highlight />
          </div>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3 mt-10 flex-wrap">
          <button
            onClick={() => {
              setOneClickUrl(undefined);
              setShowOneClick(true);
            }}
            className="relative group px-6 py-3.5 rounded-xl bg-gradient-to-r from-viral-medium to-viral-high text-black font-bold text-sm flex items-center gap-2 transition-transform hover:scale-[1.02]"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-viral-medium to-viral-high blur-xl opacity-50 -z-10 group-hover:opacity-80 transition-opacity" />
            <Zap className="w-4 h-4" />
            One-click TikTok
            <kbd className="ml-2 px-1.5 py-0.5 bg-black/20 rounded text-[10px]">⌘K</kbd>
          </button>
          <button
            onClick={() => setUrlModalOpen(true)}
            className="px-5 py-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-2 text-white transition-colors"
          >
            <Link2 className="w-4 h-4" />
            URL
            <kbd className="ml-2 px-1.5 py-0.5 bg-black/20 rounded text-[10px]">⌘U</kbd>
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-5 py-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-2 text-white transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Fichier
          </button>

          {/* Inline search — keeps the legacy search functionality */}
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-viral-medium/30"
            />
          </div>
        </div>

        <p className="text-[11px] text-white/30 mt-6">
          Astuce : colle une URL n'importe où dans l'app pour démarrer un import.
        </p>
      </header>

      {/* Body */}
      <div className="flex-1 relative z-10 pb-12">
        {loading ? (
          <FilmstripSkeleton />
        ) : projects.length === 0 ? (
          <EmptyState
            onImport={handleImport}
            onImportUrl={() => setUrlModalOpen(true)}
            importing={importing}
          />
        ) : (
          <>
            {pinnedProjects.length > 0 && (
              <section>
                <SectionHeader title="Épinglés" meta={`${pinnedProjects.length}`} />
                <ProjectFilmstrip
                  projects={pinnedProjects}
                  onOpen={handleOpenProject}
                  onPin={handlePinProject}
                  onDelete={handleDeleteProject}
                />
              </section>
            )}

            <section>
              <SectionHeader
                title={pinnedProjects.length > 0 ? 'Tous les projets' : 'Projets'}
                meta={`${otherProjects.length}`}
              />
              <ProjectFilmstrip
                projects={otherProjects}
                onOpen={handleOpenProject}
                onPin={handlePinProject}
                onDelete={handleDeleteProject}
              />
            </section>
          </>
        )}
      </div>

      {/* URL Import — inline slide-down command bar */}
      <InlineUrlBar
        open={urlModalOpen}
        initialUrl={pastedUrl}
        onClose={() => {
          setUrlModalOpen(false);
          setPastedUrl(undefined);
        }}
        onImported={() => {
          setPastedUrl(undefined);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
        }}
      />

      {/* One-click Pipeline Modal */}
      {showOneClick && (
        <OneClickModal
          initialUrl={oneClickUrl}
          onClose={() => {
            setShowOneClick(false);
            setOneClickUrl(undefined);
          }}
          onComplete={(projectId) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
            if (projectId) navigate(`/project/${projectId}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filmstrip helpers
// ---------------------------------------------------------------------------

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="px-12 mt-12 mb-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {meta && (
          <span className="text-xs text-white/40 uppercase tracking-wider">{meta}</span>
        )}
      </div>
      <div className="h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent" />
    </div>
  );
}

function StatBlock({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-4xl font-bold tabular-nums ${
          highlight
            ? 'bg-gradient-to-r from-viral-medium to-viral-high bg-clip-text text-transparent'
            : 'text-white'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 mt-1">{label}</div>
    </div>
  );
}

function ProjectFilmstrip({
  projects,
  onOpen,
  onPin,
  onDelete,
}: {
  projects: Project[];
  onOpen: (p: Project) => void;
  onPin: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div className="relative">
      {/* Horizontal scroll container */}
      <div
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory px-12 pb-6 scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {projects.map((project, i) => (
          <ProjectFilmstripCard
            key={project.id}
            project={project}
            index={i}
            onOpen={onOpen}
            onPin={onPin}
            onDelete={onDelete}
          />
        ))}
      </div>
      {/* Edge fade */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0A0A0F] to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0A0A0F] to-transparent pointer-events-none" />
    </div>
  );
}

function ProjectFilmstripCard({
  project,
  index,
  onOpen,
  onPin,
  onDelete,
}: {
  project: Project;
  index: number;
  onOpen: (p: Project) => void;
  onPin: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const isAnalyzing =
    project.status === 'analyzing' ||
    project.status === 'ingesting' ||
    project.status === 'downloading';
  const [hovered, setHovered] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through 4 evenly-spaced moments so the hover preview samples the
  // whole VOD instead of just the opening seconds.
  const keyframePoints = [0.15, 0.35, 0.6, 0.85];

  const segmentCount = project.segmentCount ?? project.segmentsCount;
  const posterUrl = `${ENGINE_BASE_URL}/v1/projects/${project.id}/thumbnail?time=${
    (project.duration || 60) / 2
  }&width=560&height=720`;
  const videoUrl = `${ENGINE_BASE_URL}/v1/projects/${project.id}/media/proxy`;

  const handleMouseEnter = () => {
    setHovered(true);
    const video = videoRef.current;
    if (!video) return;

    const cycle = () => {
      const v = videoRef.current;
      if (!v || !v.duration || !isFinite(v.duration)) return;
      // Rotate through the keyframe points based on wall-clock time so the
      // card feels alive even before interval fires.
      const idx = Math.floor((Date.now() / 2500) % keyframePoints.length);
      const pct = keyframePoints[idx];
      const target = pct * v.duration;
      if (Math.abs(v.currentTime - target) > 0.5) {
        try {
          v.currentTime = target;
        } catch {
          // ignore — buffer not ready yet
        }
      }
      setHoverProgress(pct);
    };

    video.play().catch(() => {});
    cycle();
    hoverIntervalRef.current = setInterval(cycle, 2500);
  };
  const handleMouseLeave = () => {
    setHovered(false);
    setMenuOpen(false);
    videoRef.current?.pause();
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setHoverProgress(0);
  };

  // Safety net: clear the interval if the card unmounts mid-hover
  useEffect(() => {
    return () => {
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
    };
  }, []);

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    const projectDir = project.thumbnailPath?.replace(/[/\\]thumbnail\.jpg$/, '') || '';
    if (window.forge?.openPath && projectDir) {
      window.forge.openPath(projectDir);
    }
    setMenuOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="snap-start flex-shrink-0 w-[280px] h-[420px] relative rounded-2xl overflow-hidden cursor-pointer group ring-1 ring-white/5 hover:ring-white/20 transition-shadow"
      onClick={() => onOpen(project)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Poster/thumbnail layer — works even before video loads */}
      <img
        src={posterUrl}
        alt={project.name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      {/* Video preview — plays on hover, falls back silently on error */}
      {!videoFailed && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
        />
      )}

      {/* Film placeholder behind it all */}
      <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d14] -z-10">
        <Film className="w-16 h-16 text-white/10" />
      </div>

      {/* Darken overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent transition-opacity duration-500 ${
          hovered ? 'opacity-80' : 'opacity-95'
        }`}
      />

      {/* Film-sprocket stripes — top & bottom, for the filmstrip aesthetic */}
      <div className="absolute inset-x-0 top-0 h-4 bg-black/60 flex items-center gap-1 px-2 pointer-events-none">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="w-3 h-2 rounded-sm bg-white/10" />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-4 bg-black/60 flex items-center gap-1 px-2 pointer-events-none z-10">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="w-3 h-2 rounded-sm bg-white/10" />
        ))}
      </div>

      {/* Pulsing ring if analyzing */}
      {isAnalyzing && (
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-viral-medium pointer-events-none"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Pin badge */}
      {project.isPinned && (
        <div className="absolute top-6 left-3 w-7 h-7 rounded-full bg-viral-medium/20 border border-viral-medium flex items-center justify-center backdrop-blur-md">
          <Pin className="w-3.5 h-3.5 text-viral-medium fill-viral-medium" />
        </div>
      )}

      {/* Frame number (film aesthetic) */}
      <div className="absolute top-6 right-3 text-xs font-mono text-white/40 tracking-wider tabular-nums">
        #{String(index + 1).padStart(3, '0')}
      </div>

      {/* Hover action row — pin toggle + context menu */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-7 right-10 flex items-center gap-2"
          >
            <button
              className="p-2 rounded-full bg-black/50 hover:bg-white/10 backdrop-blur-md transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onPin(project);
              }}
              title={project.isPinned ? 'Désépingler' : 'Épingler'}
              aria-label={project.isPinned ? 'Désépingler' : 'Épingler'}
            >
              <Pin
                className={`w-4 h-4 ${
                  project.isPinned
                    ? 'text-viral-medium fill-viral-medium'
                    : 'text-white/70'
                }`}
              />
            </button>

            <div className="relative">
              <button
                className="p-2 rounded-full bg-black/50 hover:bg-white/10 backdrop-blur-md transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="Plus d'actions"
              >
                <MoreVertical className="w-4 h-4 text-white/70" />
              </button>
              {menuOpen && (
                <div
                  className="absolute top-full right-0 mt-1 w-44 bg-[#14141b] border border-white/10 rounded-lg shadow-xl overflow-hidden z-20"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={handleOpenFolder}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors"
                  >
                    <FolderIcon className="w-4 h-4" />
                    Ouvrir dossier
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover "play" cue */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center pointer-events-none"
          >
            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyframe progress dots — "which moment" is being sampled */}
      {hovered && (
        <div className="absolute bottom-14 left-4 right-4 flex gap-1 z-10 pointer-events-none">
          {keyframePoints.map((p) => (
            <div
              key={p}
              className={`flex-1 h-0.5 rounded-full transition-colors ${
                hoverProgress === p ? 'bg-white' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Info bottom */}
      <div className="absolute bottom-4 inset-x-0 px-5 text-white">
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
          {project.channelName || project.sourceType || 'VOD'}
        </div>
        <h3 className="text-lg font-bold leading-tight mb-2 line-clamp-2">
          {project.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3" />
            {segmentCount ?? '—'} segments
          </span>
          {isAnalyzing ? (
            <span className="text-viral-medium font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-viral-medium animate-pulse" />
              {project.status}
            </span>
          ) : (
            <span>{project.artifactCount ?? 0} clips</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FilmstripSkeleton() {
  return (
    <div className="space-y-12">
      {[0, 1].map((row) => (
        <div key={row}>
          <SectionHeader title={row === 0 ? 'Épinglés' : 'Projets'} />
          <div className="flex gap-6 overflow-hidden px-12 pb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[280px] h-[420px] rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/5 animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function OnboardingStep({
  number,
  emoji,
  label,
  desc,
}: {
  number: string;
  emoji: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="flex items-center gap-2 justify-center mb-1">
        <span className="w-5 h-5 rounded-full bg-viral-medium/20 text-viral-medium text-xs flex items-center justify-center font-bold">
          {number}
        </span>
        <span className="font-semibold text-sm text-white">{label}</span>
      </div>
      <p className="text-xs text-white/50">{desc}</p>
    </div>
  );
}

function EmptyState({
  onImport,
  onImportUrl,
  importing,
}: {
  onImport: () => void;
  onImportUrl: () => void;
  importing: boolean;
}) {
  return (
    <div className="text-center py-16 px-12 relative z-10">
      <div className="text-6xl mb-4">🎬</div>
      <h2 className="text-2xl font-bold mb-2 text-white">Bienvenue dans FORGE LAB</h2>
      <p className="text-white/50 mb-8 max-w-md mx-auto">
        Transformez vos VODs en clips viraux en 3 étapes : importez, analysez, exportez.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
        <OnboardingStep
          number="1"
          emoji="📥"
          label="Importez"
          desc="URL YouTube/Twitch ou fichier local"
        />
        <OnboardingStep
          number="2"
          emoji="🔍"
          label="Analysez"
          desc="IA détecte les moments viraux"
        />
        <OnboardingStep
          number="3"
          emoji="🚀"
          label="Exportez"
          desc="Clips TikTok prêts à publier"
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={onImportUrl}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-viral-medium to-viral-high text-black font-bold text-sm flex items-center gap-2 hover:scale-[1.02] transition-transform"
        >
          <Link2 className="w-5 h-5" />
          Importer une URL
        </button>
        <button
          onClick={onImport}
          disabled={importing}
          className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-2 text-white disabled:opacity-50"
        >
          <Upload className="w-5 h-5" />
          Importer un fichier
        </button>
      </div>

      <p className="text-xs text-white/40 mt-6">
        Astuce : collez une URL n'importe où dans l'app pour démarrer un import.
      </p>
    </div>
  );
}
