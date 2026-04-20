/**
 * Analytics Dashboard Page
 *
 * Real-time performance tracking backed by the Forge Engine
 * analytics endpoints (`/v1/analytics/summary` and
 * `/v1/analytics/trends/performance`).
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Eye,
  Trophy,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Target,
  Film,
  Activity,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';

type Platform = 'tiktok' | 'youtube_shorts' | 'instagram' | 'twitter';

interface TopClip {
  segment_id: string;
  views: number;
  likes: number;
  predicted_score: number;
  actual_score: number;
  timestamp: number;
}

interface AnalyticsSummary {
  platform: string;
  total_clips: number;
  total_views: number;
  avg_views: number;
  avg_completion_rate: number;
  top_clips: TopClip[];
  prediction_accuracy_pct: number | null;
}

interface TrendWeek {
  week: number;
  views: number;
  clips: number;
  avg_score: number;
}

interface PerformanceTrends {
  platform: string;
  weeks: number;
  data: TrendWeek[];
}

const PLATFORMS: Array<{ id: Platform; label: string; color: string }> = [
  { id: 'tiktok', label: 'TikTok', color: 'from-pink-500 to-rose-500' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', color: 'from-red-500 to-red-600' },
  { id: 'instagram', label: 'Instagram', color: 'from-purple-500 to-pink-500' },
  { id: 'twitter', label: 'Twitter', color: 'from-sky-400 to-blue-500' },
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function relativeTime(timestamp: number): string {
  // Backend timestamps are unix seconds.
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - timestamp);
  const minutes = diff / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  if (days >= 30) return `il y a ${Math.floor(days / 30)} mois`;
  if (days >= 1) return `il y a ${Math.floor(days)} jour${days >= 2 ? 's' : ''}`;
  if (hours >= 1) return `il y a ${Math.floor(hours)} h`;
  if (minutes >= 1) return `il y a ${Math.floor(minutes)} min`;
  return 'à l’instant';
}

function accuracyColor(pct: number): { text: string; bg: string; border: string } {
  if (pct > 80) {
    return { text: 'text-green-300', bg: 'bg-green-500/20', border: 'border-green-500/30' };
  }
  if (pct > 60) {
    return { text: 'text-yellow-300', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' };
  }
  return { text: 'text-red-300', bg: 'bg-red-500/20', border: 'border-red-500/30' };
}

export default function AnalyticsPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('tiktok');

  const {
    data: summaryData,
    refetch: refetchSummary,
    isFetching: isSummaryFetching,
    isLoading: isSummaryLoading,
  } = useQuery({
    queryKey: ['analytics-summary', selectedPlatform],
    queryFn: () => api.getAnalyticsSummary(selectedPlatform, 10),
    staleTime: 60_000,
  });

  const { data: trendsData, isLoading: isTrendsLoading } = useQuery({
    queryKey: ['analytics-trends', selectedPlatform],
    queryFn: () => api.getPerformanceTrends(selectedPlatform, 8),
    staleTime: 60_000,
  });

  // The API client returns the raw payload (no ApiResponse wrapper) for
  // these two endpoints, so use the response directly.
  const summary = summaryData as AnalyticsSummary | undefined;
  const trends = trendsData as PerformanceTrends | undefined;

  const totalViews = summary?.total_views ?? 0;
  const totalClips = summary?.total_clips ?? 0;
  const avgCompletion = summary?.avg_completion_rate ?? 0;
  const accuracyPct = summary?.prediction_accuracy_pct;

  const trendPoints = trends?.data ?? [];
  const maxTrendViews = Math.max(1, ...trendPoints.map((w) => w.views));

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-cyan-400" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-400 mt-1">Suivez les performances de vos clips</p>
        </div>

        <button
          onClick={() => refetchSummary()}
          className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw
            className={`w-5 h-5 text-gray-400 ${isSummaryFetching ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Platform selector */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {PLATFORMS.map((p) => {
          const active = selectedPlatform === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                active
                  ? `bg-gradient-to-r ${p.color} text-white border-white/20 shadow-lg`
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {isSummaryLoading ? (
        <AnalyticsSkeleton showTrends={isTrendsLoading} />
      ) : summary && summary.total_clips === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <OverviewCard
              icon={Eye}
              label="Total Views"
              value={totalViews.toLocaleString()}
              color="bg-blue-500"
              delay={0}
            />
            <OverviewCard
              icon={Film}
              label="Total Clips"
              value={totalClips.toString()}
              color="bg-purple-500"
              delay={0.05}
            />
            <OverviewCard
              icon={Activity}
              label="Avg Completion Rate"
              value={`${(avgCompletion * 100).toFixed(1)}%`}
              color="bg-emerald-500"
              delay={0.1}
            />
            <AccuracyCard accuracyPct={accuracyPct ?? null} delay={0.15} />
          </div>

          {/* Trends chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 mb-8"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Tendance sur 8 semaines
              </h2>
              <div className="text-xs text-gray-500">
                {trendPoints.length > 0
                  ? `${trendPoints.reduce((s, w) => s + w.clips, 0)} clips au total`
                  : 'Pas encore de données'}
              </div>
            </div>
            <TrendsChart points={trendPoints} maxViews={maxTrendViews} />
          </motion.div>

          {/* Top clips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Top Clips
              </h2>
              <span className="text-xs text-gray-500">
                {summary?.top_clips?.length ?? 0} clips
              </span>
            </div>

            <div className="divide-y divide-white/5">
              {!summary ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                  <p className="text-gray-400 mt-2">Chargement…</p>
                </div>
              ) : summary.top_clips.length === 0 ? (
                <div className="p-8 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-600 mx-auto" />
                  <p className="text-gray-400 mt-4">
                    Aucune performance enregistrée pour cette plateforme
                  </p>
                </div>
              ) : (
                summary.top_clips.map((clip, index) => (
                  <TopClipRow key={clip.segment_id + index} clip={clip} rank={index + 1} />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton state (shown while /analytics/summary is in flight)
// ---------------------------------------------------------------------------

function AnalyticsSkeleton({ showTrends }: { showTrends: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
          >
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {showTrends && (
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 mb-8">
          <Skeleton className="h-5 w-56 mb-5" />
          <div className="flex items-end gap-2 h-40">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-md"
                // randomish heights for visual texture
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
        <div className="p-5 border-b border-white/10">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="divide-y divide-white/5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview cards
// ---------------------------------------------------------------------------

function OverviewCard({
  icon: Icon,
  label,
  value,
  color,
  delay,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400 mt-1">{label}</p>
      </div>
    </motion.div>
  );
}

function AccuracyCard({
  accuracyPct,
  delay,
}: {
  accuracyPct: number | null;
  delay: number;
}) {
  const isNull = accuracyPct === null;
  const color = !isNull ? accuracyColor(accuracyPct as number) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-amber-500">
          <Target className="w-5 h-5 text-white" />
        </div>
        {!isNull && color && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${color.text} ${color.bg} ${color.border}`}
          >
            {(accuracyPct as number).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-white">
          {isNull ? 'N/A' : `${(accuracyPct as number).toFixed(1)}%`}
        </p>
        <p className="text-sm text-gray-400 mt-1">Prediction Accuracy</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Trends chart (pure SVG)
// ---------------------------------------------------------------------------

function TrendsChart({ points, maxViews }: { points: TrendWeek[]; maxViews: number }) {
  const width = 640;
  const height = 180;
  const padding = { top: 10, right: 8, bottom: 28, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const slots = Math.max(points.length, 8);
  const gap = 8;
  const barWidth = Math.max(8, (innerWidth - gap * (slots - 1)) / slots);

  // Labels S-8 .. S-1 (from oldest to newest)
  const labels: string[] = [];
  for (let i = slots; i >= 1; i -= 1) labels.push(`S-${i}`);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />

        {Array.from({ length: slots }).map((_, index) => {
          const point = points[index];
          const views = point?.views ?? 0;
          const barHeight = maxViews > 0 ? (views / maxViews) * innerHeight : 0;
          const x = padding.left + index * (barWidth + gap);
          const y = height - padding.bottom - barHeight;
          return (
            <g key={index}>
              {views > 0 ? (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill="url(#barGradient)"
                />
              ) : (
                <rect
                  x={x}
                  y={height - padding.bottom - 2}
                  width={barWidth}
                  height={2}
                  rx={1}
                  fill="rgba(255,255,255,0.08)"
                />
              )}
              {views > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(255,255,255,0.7)"
                >
                  {formatNumber(views)}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(255,255,255,0.45)"
              >
                {labels[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top clip row
// ---------------------------------------------------------------------------

function TopClipRow({ clip, rank }: { clip: TopClip; rank: number }) {
  const delta = clip.actual_score - clip.predicted_score;
  const deltaColor =
    delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Activity;
  const shortId =
    clip.segment_id.length > 10
      ? `${clip.segment_id.slice(0, 6)}…${clip.segment_id.slice(-4)}`
      : clip.segment_id;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
        #{rank}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">Clip {shortId}</p>
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {relativeTime(clip.timestamp)}
        </p>
      </div>

      <div className="text-center hidden sm:block">
        <p className="text-white font-semibold">{formatNumber(clip.views)}</p>
        <p className="text-xs text-gray-500">vues</p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <div className="text-center">
          <p className="text-gray-300 font-semibold">{clip.predicted_score.toFixed(1)}</p>
          <p className="text-xs text-gray-500">prédit</p>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold">{clip.actual_score.toFixed(1)}</p>
          <p className="text-xs text-gray-500">réel</p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3" />
          {Math.abs(delta).toFixed(1)}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  const snippet = `POST /v1/virality/performance
{
  "segment_id": "...",
  "predicted_score": 72,
  "platform": "tiktok",
  "views": 50000
}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-10 text-center"
    >
      <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-cyan-500/20">
        <BarChart3 className="w-8 h-8 text-cyan-400" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">
        Aucune donnée de performance enregistrée
      </h3>
      <p className="mt-2 text-sm text-gray-400 max-w-xl mx-auto">
        Les stats apparaissent automatiquement quand vous enregistrez les vues/likes de vos
        clips publiés via l’API{' '}
        <code className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 text-xs">
          /v1/virality/performance
        </code>
        .
      </p>
      <pre className="mt-6 inline-block text-left bg-black/40 border border-white/10 rounded-lg p-4 text-xs text-gray-200 font-mono whitespace-pre overflow-x-auto">
        {snippet}
      </pre>
    </motion.div>
  );
}
