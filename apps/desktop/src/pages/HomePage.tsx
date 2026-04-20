import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ENGINE_BASE_URL } from '@/lib/config';
import { Plus, Search, Film, Layers, TrendingUp, Calendar, Link2, Upload, MoreVertical, Play, Trash2, FolderOpen as FolderIcon, Pin, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SkeletonProjectCard } from '@/components/ui/Skeleton';
import { UrlImportModal } from '@/components/import/UrlImportModal';
import OneClickModal from '@/components/import/OneClickModal';
import ProjectProgress from '@/components/project/ProjectProgress';
import { api } from '@/lib/api';
import { useProjects, QUERY_KEYS } from '@/lib/queries';
import { formatDuration } from '@/lib/utils';
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

  // (Removed: redundant invalidate-on-lastUpdate effect that caused infinite loop
  // with the setStoreProjects effect above. WebSocket handlers invalidate
  // queries directly in store/websocket.ts.)

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

  return (
    <div
      className="h-full flex flex-col relative"
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
      {dragOver && (
        <div className="fixed inset-0 bg-viral-medium/10 border-4 border-dashed border-viral-medium z-50 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-4xl mb-3">📥</p>
            <p className="text-2xl font-bold">Lâchez vos VODs ici</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">MP4, MKV, AVI, MOV, WebM, FLV, WMV</p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="px-8 py-6 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Projets</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Gérez vos VODs et créez des clips viraux
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setOneClickUrl(undefined);
                setShowOneClick(true);
              }}
              className="bg-gradient-to-r from-viral-medium to-viral-high"
            >
              <Zap className="w-5 h-5 mr-2" />
              One-click TikTok
            </Button>
            <Button variant="secondary" onClick={() => setUrlModalOpen(true)}>
              <Link2 className="w-4 h-4 mr-2" />
              Import URL
            </Button>
            <Button onClick={handleImport} loading={importing}>
              <Plus className="w-4 h-4 mr-2" />
              Importer fichier
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher un projet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {/* Dashboard stats */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Projets"
              value={stats?.total_projects ?? projects.length}
            />
            <StatCard
              label="Clips ce mois"
              value={stats?.clips_this_month ?? 0}
            />
            <StatCard
              label="Score moyen"
              value={`${Number(
                (stats?.avg_score ??
                  projects.reduce((acc, p) => acc + (p.averageScore ?? 0), 0) /
                    Math.max(1, projects.filter((p) => (p.averageScore ?? 0) > 0).length)) ||
                  0,
              ).toFixed(0)}%`}
            />
            <StatCard
              label="Top score"
              value={
                (stats?.top_score ??
                  Math.round(
                    projects.reduce((m, p) => Math.max(m, p.averageScore ?? 0), 0),
                  )) ||
                '—'
              }
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <SkeletonProjectCard key={i} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            onImport={handleImport}
            onImportUrl={() => setUrlModalOpen(true)}
            importing={importing}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                onClick={() => navigate(`/project/${project.id}`)}
                onDelete={() => {
                  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
                }}
              />
            ))}
          </motion.div>
        )}
      </div>
      
      {/* URL Import Modal */}
      <UrlImportModal
        isOpen={urlModalOpen}
        onClose={() => {
          setUrlModalOpen(false);
          setPastedUrl(undefined);
        }}
        initialUrl={pastedUrl}
        onImportComplete={(projectId) => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
          setPastedUrl(undefined);
          navigate(`/project/${projectId}`);
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

function ProjectCard({
  project,
  index,
  onClick,
  onDelete,
}: {
  project: Project;
  index: number;
  onClick: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinning, setPinning] = useState(false);

  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinning) return;
    setPinning(true);
    try {
      await api.pinProject(project.id, !project.isPinned);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Impossible d\'épingler le projet',
      });
    } finally {
      setPinning(false);
    }
  };
  
  const statusLabels: Record<string, string> = {
    created: 'Nouveau',
    ingesting: 'Importation...',
    ingested: 'Prêt',
    analyzing: 'Analyse...',
    analyzed: 'Analysé',
    ready: 'Prêt',
    error: 'Erreur',
  };

  const statusColors: Record<string, string> = {
    created: 'bg-gray-500/10 text-gray-400',
    ingesting: 'bg-amber-500/10 text-amber-500',
    ingested: 'bg-blue-500/10 text-blue-400',
    analyzing: 'bg-amber-500/10 text-amber-500',
    analyzed: 'bg-green-500/10 text-green-400',
    ready: 'bg-green-500/10 text-green-400',
    error: 'bg-red-500/10 text-red-400',
  };
  
  // Primary action based on status
  const getPrimaryAction = () => {
    switch (project.status) {
      case 'created':
        return { label: 'Ingérer', icon: Play, action: async () => {
          await api.ingestProject(project.id);
          onClick();
        }};
      case 'ingested':
        return { label: 'Analyser', icon: Play, action: async () => {
          await api.analyzeProject(project.id);
          onClick();
        }};
      case 'analyzed':
      case 'ready':
        return { label: 'Forge', icon: Layers, action: () => navigate(`/project/${project.id}`) };
      default:
        return null;
    }
  };
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer le projet "${project.name}" ?`)) return;
    
    try {
      await api.request(`/projects/${project.id}`, { method: 'DELETE' });
      onDelete();
      addToast({ type: 'success', title: 'Projet supprimé', message: project.name });
    } catch (error) {
      addToast({ type: 'error', title: 'Erreur', message: 'Échec de la suppression' });
    }
    setMenuOpen(false);
  };
  
  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    const projectDir = project.thumbnailPath?.replace(/[/\\]thumbnail\.jpg$/, '') || '';
    if (window.forge?.openPath && projectDir) {
      window.forge.openPath(projectDir);
    }
    setMenuOpen(false);
  };
  
  const primaryAction = getPrimaryAction();

  // Format date relative
  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // Use API endpoint for thumbnails (works in both web and Electron)
  const thumbUrl = `${ENGINE_BASE_URL}/v1/projects/${project.id}/thumbnail?time=${(project.duration || 60) / 2}&width=320&height=180`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        className="cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all group bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden"
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className="aspect-video bg-[var(--bg-tertiary)] relative overflow-hidden flex items-center justify-center">
          <img
            src={thumbUrl}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              // Fallback to placeholder on error
              e.currentTarget.style.display = 'none';
            }}
          />
          <Film className="w-12 h-12 text-[var(--text-muted)] opacity-30 absolute" />
          
          {/* Duration badge */}
          {project.duration && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-medium text-white z-10">
              {formatDuration(project.duration)}
            </div>
          )}
          
          {/* Score badge */}
          {project.averageScore !== undefined && project.averageScore > 0 && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded text-[10px] font-bold text-white flex items-center gap-0.5 z-10">
              <TrendingUp className="w-2.5 h-2.5" />
              {Math.round(project.averageScore)}
            </div>
          )}
          
          {/* Global progress overlay for active projects */}
          <ProjectProgress projectId={project.id} projectStatus={project.status} />
          
          {/* Hover overlay with actions */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            {primaryAction && (
              <button
                onClick={(e) => { e.stopPropagation(); primaryAction.action(); }}
                className="px-3 py-1.5 bg-[var(--accent-color)] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:brightness-110 transition-all"
              >
                <primaryAction.icon className="w-3.5 h-3.5" />
                {primaryAction.label}
              </button>
            )}
          </div>
          
          {/* Context menu button */}
          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="p-1.5 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4 text-white" />
              </button>
              
              {menuOpen && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={handleOpenFolder}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <FolderIcon className="w-4 h-4" />
                    Ouvrir dossier
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-color)] truncate flex-1 text-sm flex items-center gap-1.5">
              {project.isPinned && (
                <Pin
                  className="w-3 h-3 text-viral-medium fill-current shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{project.name}</span>
            </h3>
            <button
              onClick={togglePin}
              disabled={pinning}
              title={project.isPinned ? 'Désépingler' : 'Épingler'}
              aria-label={project.isPinned ? 'Désépingler le projet' : 'Épingler le projet'}
              className={`p-1 rounded-md hover:bg-white/10 transition-colors shrink-0 ${
                project.isPinned ? 'text-viral-medium' : 'text-[var(--text-muted)]'
              } ${pinning ? 'opacity-50 cursor-wait' : ''}`}
            >
              <Pin className={`w-3.5 h-3.5 ${project.isPinned ? 'fill-current' : ''}`} />
            </button>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                statusColors[project.status] || statusColors.created
              }`}
            >
              {statusLabels[project.status] || project.status}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatRelativeDate(project.createdAt)}
            </span>
            
            {project.segmentsCount !== undefined && project.segmentsCount > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {project.segmentsCount} clip{project.segmentsCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

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
    <div className="p-4 rounded-lg bg-white/5 border border-white/10">
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="flex items-center gap-2 justify-center mb-1">
        <span className="w-5 h-5 rounded-full bg-viral-medium/20 text-viral-medium text-xs flex items-center justify-center font-bold">
          {number}
        </span>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{desc}</p>
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
    <div className="text-center py-16">
      <div className="text-6xl mb-4">🎬</div>
      <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
        Bienvenue dans FORGE LAB
      </h2>
      <p className="text-[var(--text-muted)] mb-8 max-w-md mx-auto">
        Transformez vos VODs en clips viraux en 3 étapes : importez, analysez,
        exportez.
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
        <Button variant="primary" size="lg" onClick={onImportUrl}>
          <Link2 className="w-5 h-5 mr-2" />
          Importer une URL
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={onImport}
          loading={importing}
        >
          <Upload className="w-5 h-5 mr-2" />
          Importer un fichier
        </Button>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-6">
        Astuce : collez une URL n'importe où dans l'app pour démarrer un import.
      </p>
    </div>
  );
}


