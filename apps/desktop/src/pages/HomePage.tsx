import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { useQueryClient } from '@tanstack/react-query';
import { ENGINE_BASE_URL } from '@/lib/config';
import { Plus, Search, FolderOpen, Film, Layers, TrendingUp, Calendar, Link2, MoreVertical, Play, Trash2, FolderOpen as FolderIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SkeletonProjectCard } from '@/components/ui/Skeleton';
import { UrlImportModal } from '@/components/import/UrlImportModal';
import ProjectProgress from '@/components/project/ProjectProgress';
import { api } from '@/lib/api';
import { useProjects, QUERY_KEYS } from '@/lib/queries';
import { formatDuration } from '@/lib/utils';
import { useToastStore, useJobsStore, useProjectsStore } from '@/store';

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
}

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const { addJob } = useJobsStore();
  const { projects: storeProjects, lastUpdate, setProjects: setStoreProjects } = useProjectsStore();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);

  // React Query: fetch projects
  const { data: projectsData, isLoading: loading, isError: projectsError } = useProjects(search || undefined);
  const projects: Project[] = (projectsData?.data?.items || []) as Project[];

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

  // Sync to global store for WebSocket updates compatibility
  useEffect(() => {
    if (projects.length > 0) {
      setStoreProjects(projects);
    }
  }, [projects, setStoreProjects]);

  // Keyword shortcuts
  useHotkeys('ctrl+i, meta+i', () => handleImport(), { preventDefault: true });
  useHotkeys('ctrl+u, meta+u', () => setUrlModalOpen(true), { preventDefault: true });

  // Sync local state with store updates from WebSocket
  useEffect(() => {
    if (lastUpdate > 0 && storeProjects.length > 0) {
      // Invalidate queries to pick up WebSocket-driven changes
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
    }
  }, [lastUpdate, storeProjects, queryClient]);

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

      // Start ingest
      const ingestResponse = await api.ingestProject(project.id);

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
    <div className="h-full flex flex-col">
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
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <SkeletonProjectCard key={i} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onImport={handleImport} importing={importing} />
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
        onClose={() => setUrlModalOpen(false)}
        onImportComplete={(projectId) => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects });
          navigate(`/project/${projectId}`);
        }}
      />
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
  const { addToast } = useToastStore();
  const [menuOpen, setMenuOpen] = useState(false);
  
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
            <h3 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-color)] truncate flex-1 text-sm">
              {project.name}
            </h3>
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

function EmptyState({
  onImport,
  importing,
}: {
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-6">
          <FolderOpen className="w-10 h-10 text-[var(--text-muted)] opacity-50" />
        </div>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Aucun projet
        </h2>
        
        <p className="text-[var(--text-muted)] mb-6">
          Importez votre première VOD pour commencer à créer des clips viraux
        </p>

        <Button onClick={onImport} loading={importing} size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Importer une vidéo
        </Button>

        <p className="text-xs text-[var(--text-muted)] mt-4">
          Formats supportés : MP4, MKV, MOV, AVI, WebM
        </p>
      </div>
    </div>
  );
}


