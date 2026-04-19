import {
  Play,
  Clock,
  ChevronRight,
  Download,
  Layers,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDuration } from '@/lib/utils';
import { api } from '@/lib/api';
import { useToastStore } from '@/store';

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  topicLabel?: string;
  hookText?: string;
  transcript?: string;
  score: {
    total: number;
    hookStrength: number;
    payoff: number;
    humourReaction: number;
    tensionSurprise: number;
    clarityAutonomy: number;
    rhythm: number;
    reasons: string[];
    tags: string[];
  };
}

interface SegmentScoreCardProps {
  segment: Segment | null;
  projectId: string;
  onNavigateToEditor: (segmentId: string) => void;
  onPlaySegment: (segment: Segment) => void;
}

function ScoreBadge({ score, size = 'md' }: { score: number | undefined | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = score ?? 0;
  const colors = s >= 70 ? 'bg-green-500' : s >= 50 ? 'bg-amber-500' : 'bg-gray-500';
  const sizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg',
  };

  return (
    <div className={`${sizes[size]} ${colors} rounded-lg flex items-center justify-center text-white font-bold`}>
      {Math.round(s)}
    </div>
  );
}

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-muted)] w-28">{label}</span>
      <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--text-secondary)] w-10 text-right">{value}/{max}</span>
    </div>
  );
}

export function SegmentScoreCard({
  segment,
  projectId,
  onNavigateToEditor,
  onPlaySegment,
}: SegmentScoreCardProps) {
  if (!segment) {
    return (
      <div className="w-80 flex flex-col border-l border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <ChevronRight className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
            <p className="text-sm text-[var(--text-muted)]">
              Sélectionnez un segment pour voir les détails
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 flex flex-col border-l border-[var(--border-color)] bg-[var(--bg-card)]">
      {/* Segment info */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3 mb-4">
          <ScoreBadge score={segment.score?.total} size="lg" />
          <div className="flex-1">
            <h3 className="font-semibold text-[var(--text-primary)]">
              {segment.topicLabel || 'Segment sans titre'}
            </h3>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(segment.duration)}</span>
              {segment.duration >= 60 ? (
                <span className="flex items-center text-green-500">
                  <Check className="w-3 h-3 mr-0.5" /> Monétisable
                </span>
              ) : (
                <span className="flex items-center text-amber-500">
                  <AlertTriangle className="w-3 h-3 mr-0.5" /> &lt; 1 min
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hook */}
        {segment.hookText && (
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-3">
            <p className="text-xs text-[var(--text-muted)] mb-1">Hook détecté</p>
            <p className="text-sm text-[var(--text-primary)] italic">"{segment.hookText}"</p>
          </div>
        )}

        {/* Tags */}
        {(segment.score?.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {segment.score?.tags?.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-xs rounded-full capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Score détaillé</h4>
        <div className="space-y-2">
          <ScoreRow label="Hook" value={segment.score?.hookStrength ?? 0} max={25} />
          <ScoreRow label="Payoff" value={segment.score?.payoff ?? 0} max={20} />
          <ScoreRow label="Humour/Réaction" value={segment.score?.humourReaction ?? 0} max={15} />
          <ScoreRow label="Tension/Surprise" value={segment.score?.tensionSurprise ?? 0} max={15} />
          <ScoreRow label="Clarté" value={segment.score?.clarityAutonomy ?? 0} max={15} />
          <ScoreRow label="Rythme" value={segment.score?.rhythm ?? 0} max={10} />
        </div>
      </div>

      {/* Transcript preview */}
      {segment.transcript && (
        <div className="flex-1 overflow-auto p-4">
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Transcription</h4>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {segment.transcript.slice(0, 500)}
            {segment.transcript.length > 500 && '...'}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t border-[var(--border-color)] space-y-2">
        <Button
          size="sm"
          onClick={() => onNavigateToEditor(segment.id)}
          className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600"
        >
          <Layers className="w-4 h-4" />
          Ouvrir l'éditeur 9:16
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await api.exportSegment(projectId, {
                segmentId: segment.id,
                platform: 'tiktok',
                includeCaptions: true,
                burnSubtitles: true,
                includeCover: true,
                includeMetadata: true,
              });
              useToastStore.getState().addToast({
                type: 'success',
                title: '🎵 TikTok en route',
                message: "Export lancé avec preset TikTok. Check l'onglet Export.",
              });
            } catch {
              useToastStore.getState().addToast({
                type: 'error',
                title: 'Échec',
                message: "Impossible de lancer l'export.",
              });
            }
          }}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white"
          title="Export direct avec preset TikTok (1080x1920, 60s max, sous-titres, cover, metadata)"
        >
          ⚡ TikTok rapide
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPlaySegment(segment)}
            className="flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            Preview
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await api.exportSegment(projectId, {
                  segmentId: segment.id,
                  platform: 'tiktok',
                  includeCaptions: true,
                  burnSubtitles: true,
                  includeCover: true,
                });
                useToastStore.getState().addToast({
                  type: 'success',
                  title: 'Export lancé',
                  message: "Check l'onglet Export pour le suivi.",
                });
              } catch (err) {
                useToastStore.getState().addToast({
                  type: 'error',
                  title: 'Échec',
                  message: "Impossible de lancer l'export.",
                });
              }
            }}
            className="flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export rapide
          </Button>
        </div>
      </div>
    </div>
  );
}
