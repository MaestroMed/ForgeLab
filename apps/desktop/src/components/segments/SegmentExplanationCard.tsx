import { motion } from 'framer-motion';
import { Check, AlertTriangle, Sparkles } from 'lucide-react';

export interface SegmentExplanation {
  summary?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  subscores?: Record<string, number>;
  suggested_title?: string | null;
  suggested_description?: string | null;
  suggested_hashtags?: string[];
  suggested_platforms?: string[];
  confidence?: number;
}

interface Props {
  explanation: SegmentExplanation;
  score: number;
}

const SUBSCORE_LABELS: Record<string, string> = {
  hook: 'Accroche',
  payoff: 'Payoff',
  clarity: 'Clarté',
  energy: 'Énergie',
  face: 'Facecam',
  facecam: 'Facecam',
  pacing: 'Rythme',
  novelty: 'Nouveauté',
  platform_fit: 'Fit plateforme',
  llm: 'LLM',
  ml: 'ML',
};

function scoreTierColor(v: number): string {
  if (v >= 85) return '#EF4444'; // red — viral
  if (v >= 75) return '#F59E0B'; // gold
  if (v >= 60) return '#22C55E'; // green
  return '#3B82F6';              // blue
}

/**
 * Explainable score card — surfaces the signals and evidence that drove
 * a segment's score instead of a mysterious number. Core product
 * differentiator: "this clip scored 92 because [...]".
 */
export default function SegmentExplanationCard({ explanation, score }: Props) {
  const strengths = explanation.strengths ?? [];
  const weaknesses = explanation.weaknesses ?? [];
  const subscores = explanation.subscores ?? {};
  const subEntries = Object.entries(subscores).sort((a, b) => b[1] - a[1]);

  const big = scoreTierColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-4"
    >
      {/* Headline — score badge + summary */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: `radial-gradient(circle, ${big}30, ${big}10)`,
            border: `1px solid ${big}40`,
            boxShadow: `0 0 20px ${big}30`,
          }}
        >
          <span className="text-2xl font-bold tabular-nums" style={{ color: big }}>
            {Math.round(score)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Sparkles className="w-3 h-3" />
            Pourquoi ce score
          </div>
          <p className="text-sm text-white/90 leading-relaxed">
            {explanation.summary || "Aucune explication générée pour ce segment."}
          </p>
        </div>
      </div>

      {/* Subscore bars */}
      {subEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {subEntries.slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-white/50 w-20 truncate">
                {SUBSCORE_LABELS[k] ?? k}
              </span>
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, v))}%`,
                    backgroundColor: scoreTierColor(v),
                  }}
                />
              </div>
              <span
                className="text-[10px] tabular-nums font-medium w-7 text-right"
                style={{ color: scoreTierColor(v) }}
              >
                {Math.round(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div>
          <div className="text-[10px] text-green-400 uppercase tracking-wider mb-1.5">
            Points forts
          </div>
          <ul className="space-y-1">
            {strengths.slice(0, 5).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/80">
                <Check className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div>
          <div className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1.5">
            À surveiller
          </div>
          <ul className="space-y-1">
            {weaknesses.slice(0, 3).map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested metadata */}
      {(explanation.suggested_title ||
        (explanation.suggested_platforms?.length ?? 0) > 0) && (
        <div className="pt-3 border-t border-white/5 space-y-2">
          {explanation.suggested_title && (
            <div className="text-sm">
              <span className="text-[10px] text-white/40 uppercase tracking-wider mr-2">
                Titre
              </span>
              <span className="text-white/90 italic">
                &quot;{explanation.suggested_title}&quot;
              </span>
            </div>
          )}
          {explanation.suggested_platforms &&
            explanation.suggested_platforms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-white/40 uppercase tracking-wider mr-1">
                  Plateformes
                </span>
                {explanation.suggested_platforms.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] px-1.5 py-0.5 bg-viral-medium/10 border border-viral-medium/30 rounded text-viral-medium"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
        </div>
      )}

      {typeof explanation.confidence === 'number' && (
        <div className="text-[10px] text-white/30 text-right">
          Confiance: {Math.round(explanation.confidence * 100)}%
        </div>
      )}
    </motion.div>
  );
}
