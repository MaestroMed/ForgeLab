import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload, Search, Sparkles, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useJobsStore, useToastStore, useUIStore, useProjectsStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { useProject, QUERY_KEYS } from '@/lib/queries';
import IngestPanel from '@/components/project/IngestPanel';
import AnalyzePanel from '@/components/project/AnalyzePanel';
import ForgePanel from '@/components/project/ForgePanel';
import ExportPanel from '@/components/project/ExportPanel';
import ProgressOverlay from '@/components/project/ProgressOverlay';

// Panel prerequisite messages
const PANEL_PREREQUISITES: Record<string, string> = {
  ingest: '',
  analyze: 'Ingestion requise avant l\'analyse',
  forge: 'Analyse requise avant de forger les clips',
  export: 'Analyse requise avant l\'export',
};

const panels = [
  { id: 'ingest', label: 'Ingest', icon: Upload },
  { id: 'analyze', label: 'Analyze', icon: Search },
  { id: 'forge', label: 'Forge', icon: Sparkles },
  { id: 'export', label: 'Export', icon: Download },
];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentPanel, setCurrentPanel } = useUIStore();
  const { addToast } = useToastStore();
  const { addJob } = useJobsStore();
  const previousJobStatusRef = useRef<Record<string, string>>({});

  // React Query — single source of truth for project data
  const { data: projectResponse, isLoading, isError } = useProject(id);
  const project = projectResponse?.data ?? null;

  // Helper: refresh project data (invalidate React Query cache)
  const refreshProject = () => {
    if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.project(id) });
  };

  // Navigate away on fetch error
  useEffect(() => {
    if (isError) {
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible de charger le projet' });
      navigate('/');
    }
  }, [isError, addToast, navigate]);

  // Get active jobs for this project from the WebSocket-synced store
  const projectJobs = useJobsStore(
    useShallow((state) => state.jobs.filter((j) => j.projectId === id))
  );

  // Get project updates from WebSocket store
  const storeProject = useProjectsStore(
    useShallow((state) => state.projects.find((p) => p.id === id))
  );

  // Watch for job completion via WebSocket — invalidate cache instead of manual fetch
  useEffect(() => {
    projectJobs.forEach((job) => {
      const prevStatus = previousJobStatusRef.current[job.id];
      const wasNotComplete = !prevStatus || prevStatus === 'running' || prevStatus === 'pending';

      if (wasNotComplete && job.status === 'completed') {
        refreshProject();
        if (job.type === 'ingest') setCurrentPanel('analyze');
        else if (job.type === 'analyze') setCurrentPanel('forge');
      }

      previousJobStatusRef.current[job.id] = job.status;
    });
  }, [projectJobs]);

  // When WebSocket pushes a project status change, sync the cache
  useEffect(() => {
    if (storeProject && project && storeProject.status !== project.status) {
      refreshProject();
    }
  }, [storeProject?.status]);

  // Panel availability logic
  const getPanelStatus = (panelId: string): 'locked' | 'available' | 'active' | 'complete' => {
    if (!project) return 'locked';
    const statusMap: Record<string, string[]> = {
      created: ['ingest'],
      ingesting: ['ingest'],
      ingested: ['ingest', 'analyze'],
      analyzing: ['ingest', 'analyze'],
      analyzed: ['ingest', 'analyze', 'forge', 'export'],
      ready: ['ingest', 'analyze', 'forge', 'export'],
    };
    const available = statusMap[project.status] || ['ingest'];
    if (!available.includes(panelId)) return 'locked';
    if (panelId === currentPanel) return 'active';
    if (panelId === 'ingest' && ['ingested', 'analyzed', 'ready'].includes(project.status)) return 'complete';
    if (panelId === 'analyze' && ['analyzed', 'ready'].includes(project.status)) return 'complete';
    return 'available';
  };

  // Loading skeleton — header + content placeholder
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <header className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-4">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-10 w-72 rounded-lg" />
        </header>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const hasActiveJob = projectJobs.some((j) => j.status === 'running');

  return (
    <div className="h-full flex flex-col">
      {hasActiveJob && <ProgressOverlay projectId={id!} />}

      <header className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] truncate">
            {project.name}
          </h1>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {project.sourceFilename}
          </p>
        </div>

        <nav className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-1">
          {panels.map((panel) => {
            const status = getPanelStatus(panel.id);
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                onClick={() => status !== 'locked' && setCurrentPanel(panel.id as any)}
                disabled={status === 'locked'}
                title={status === 'locked' ? PANEL_PREREQUISITES[panel.id] : undefined}
                className={`
                  relative px-4 py-2 rounded-md text-sm font-medium transition-all
                  flex items-center gap-2 group
                  ${status === 'active'
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                    : status === 'locked'
                    ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{panel.label}</span>
                {status === 'complete' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-viral-high" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPanel}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-full"
          >
            {currentPanel === 'ingest' && (
              <IngestPanel
                project={project}
                onJobStart={(jobId) => addJob({ id: jobId, type: 'ingest', projectId: project.id, status: 'running', progress: 0 })}
                onComplete={() => { refreshProject(); setCurrentPanel('analyze'); }}
              />
            )}
            {currentPanel === 'analyze' && (
              <AnalyzePanel
                project={project}
                onJobStart={(jobId) => addJob({ id: jobId, type: 'analyze', projectId: project.id, status: 'running', progress: 0 })}
                onComplete={() => { refreshProject(); setCurrentPanel('forge'); }}
              />
            )}
            {currentPanel === 'forge' && <ForgePanel project={project} />}
            {currentPanel === 'export' && <ExportPanel project={project} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
