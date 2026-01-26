import { useMemo } from 'react';

export interface ButtonCondition {
  met: boolean;
  message: string;
}

export interface ButtonState {
  disabled: boolean;
  tooltip: string | null;
  conditions: ButtonCondition[];
}

/**
 * Hook to manage button states with prerequisite conditions.
 * 
 * @example
 * const { disabled, tooltip } = useButtonState([
 *   { met: project !== null, message: 'Sélectionnez un projet' },
 *   { met: project?.status === 'ingested', message: 'Attendez la fin de l\'ingestion' },
 * ]);
 */
export function useButtonState(conditions: ButtonCondition[]): ButtonState {
  return useMemo(() => {
    const unmetConditions = conditions.filter(c => !c.met);
    
    return {
      disabled: unmetConditions.length > 0,
      tooltip: unmetConditions.length > 0 
        ? unmetConditions[0].message 
        : null,
      conditions,
    };
  }, [conditions]);
}

// Pre-defined condition builders for common use cases
export const ButtonConditions = {
  /**
   * Project must exist
   */
  projectExists: (project: any): ButtonCondition => ({
    met: !!project,
    message: 'Sélectionnez un projet',
  }),
  
  /**
   * Project must have a source file
   */
  hasSource: (project: any): ButtonCondition => ({
    met: !!project?.source_path || !!project?.sourcePath,
    message: 'Importez d\'abord une vidéo',
  }),
  
  /**
   * Project ingestion must be complete
   */
  isIngested: (project: any): ButtonCondition => ({
    met: project?.status !== 'pending' && project?.status !== 'downloading',
    message: 'Attendez la fin du téléchargement/ingestion',
  }),
  
  /**
   * Project analysis must be complete
   */
  isAnalyzed: (project: any): ButtonCondition => ({
    met: project?.status === 'analyzed' || project?.status === 'exporting' || project?.status === 'exported',
    message: 'Attendez la fin de l\'analyse',
  }),
  
  /**
   * Segment must be selected
   */
  segmentSelected: (segment: any): ButtonCondition => ({
    met: !!segment,
    message: 'Sélectionnez un segment à exporter',
  }),
  
  /**
   * At least N segments required
   */
  hasSegments: (segments: any[], min: number = 1): ButtonCondition => ({
    met: segments?.length >= min,
    message: min === 1 
      ? 'Aucun segment disponible' 
      : `Au moins ${min} segments requis`,
  }),
  
  /**
   * No jobs running for this project
   */
  noRunningJobs: (jobs: any[], projectId?: string): ButtonCondition => {
    const runningJobs = jobs.filter(
      j => j.status === 'running' && 
           (!projectId || j.projectId === projectId)
    );
    return {
      met: runningJobs.length === 0,
      message: 'Attendez la fin des tâches en cours',
    };
  },
  
  /**
   * Engine must be connected
   */
  engineConnected: (connected: boolean): ButtonCondition => ({
    met: connected,
    message: 'Moteur non connecté',
  }),
  
  /**
   * Layout must be configured
   */
  layoutConfigured: (layout: any): ButtonCondition => ({
    met: !!(layout?.facecam_rect || layout?.facecamRect) && 
         !!(layout?.content_rect || layout?.contentRect),
    message: 'Configurez le layout vidéo (facecam + contenu)',
  }),
  
  /**
   * Export completed for segment
   */
  exportCompleted: (artifacts: any[], segmentId: string): ButtonCondition => {
    const hasVideo = artifacts?.some(
      a => a.segment_id === segmentId && a.type === 'video'
    );
    return {
      met: hasVideo,
      message: 'Exportez d\'abord le segment',
    };
  },
};

/**
 * Wrapper component for buttons with conditions
 */
export interface ConditionalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  conditions: ButtonCondition[];
  children: React.ReactNode;
}

/**
 * Get combined state for multiple independent button groups
 */
export function combineButtonStates(states: ButtonState[]): ButtonState {
  const allConditions = states.flatMap(s => s.conditions);
  const unmetConditions = allConditions.filter(c => !c.met);
  
  return {
    disabled: unmetConditions.length > 0,
    tooltip: unmetConditions.length > 0 ? unmetConditions[0].message : null,
    conditions: allConditions,
  };
}
