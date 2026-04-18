import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  score?: { total: number };
  topicLabel?: string;
}

interface TimelineHeatmapProps {
  segments: Segment[];
  totalDuration: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  height?: number;
  className?: string;
}

/**
 * Visual heatmap showing segment distribution across the video timeline.
 * Color intensity indicates score (green = high, gray = low).
 * Clickable to jump to specific times.
 */
export function TimelineHeatmap({
  segments,
  totalDuration,
  currentTime = 0,
  onSeek,
  height = 32,
  className = '',
}: TimelineHeatmapProps) {
  // Calculate heatmap data - aggregate segments into buckets
  const heatmapData = useMemo(() => {
    if (totalDuration <= 0 || segments.length === 0) {
      return [];
    }

    // Create buckets (1 per ~1% of duration, min 20, max 100)
    const bucketCount = Math.min(100, Math.max(20, Math.floor(totalDuration / 10)));
    const bucketDuration = totalDuration / bucketCount;
    
    const buckets: { 
      start: number; 
      end: number; 
      segments: Segment[]; 
      maxScore: number;
      avgScore: number;
    }[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const start = i * bucketDuration;
      const end = (i + 1) * bucketDuration;
      
      // Find segments that overlap with this bucket
      const overlapping = segments.filter(seg => 
        seg.startTime < end && seg.endTime > start
      );
      
      const scores = overlapping.map(s => s.score?.total || 0);
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      
      buckets.push({
        start,
        end,
        segments: overlapping,
        maxScore,
        avgScore,
      });
    }

    return buckets;
  }, [segments, totalDuration]);

  // Get color based on score
  const getColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-lime-500';
    if (score >= 40) return 'bg-amber-500';
    if (score >= 20) return 'bg-orange-500';
    if (score > 0) return 'bg-gray-500';
    return 'bg-gray-800';
  };

  // Get opacity based on segment count
  const getOpacity = (segmentCount: number) => {
    if (segmentCount >= 3) return 'opacity-100';
    if (segmentCount >= 2) return 'opacity-80';
    if (segmentCount >= 1) return 'opacity-60';
    return 'opacity-20';
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || totalDuration <= 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * totalDuration;
    
    onSeek(Math.max(0, Math.min(totalDuration, time)));
  };

  if (totalDuration <= 0) {
    return null;
  }

  const playheadPosition = (currentTime / totalDuration) * 100;

  return (
    <div 
      className={`relative rounded-lg overflow-hidden cursor-pointer group ${className}`}
      style={{ height }}
      onClick={handleClick}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[var(--bg-tertiary)]" />
      
      {/* Heatmap bars */}
      <div className="absolute inset-0 flex">
        {heatmapData.map((bucket, i) => (
          <div
            key={i}
            className={`flex-1 relative ${getColor(bucket.maxScore)} ${getOpacity(bucket.segments.length)} transition-opacity duration-150`}
            style={{ 
              height: `${Math.max(20, (bucket.avgScore / 100) * 100)}%`,
              alignSelf: 'flex-end',
            }}
          >
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 pointer-events-none">
              {bucket.segments.length > 0 && (
                <div className="bg-black/90 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                  {bucket.segments.length} segment{bucket.segments.length > 1 ? 's' : ''} 
                  {bucket.maxScore > 0 && ` • max ${bucket.maxScore}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Segment markers */}
      <div className="absolute inset-0 pointer-events-none">
        {segments.map((seg) => {
          const left = (seg.startTime / totalDuration) * 100;
          const width = ((seg.endTime - seg.startTime) / totalDuration) * 100;
          const score = seg.score?.total || 0;
          
          return (
            <div
              key={seg.id}
              className={`absolute top-0 h-1 rounded-full ${
                score >= 70 ? 'bg-green-400' : score >= 50 ? 'bg-amber-400' : 'bg-gray-400'
              }`}
              style={{ 
                left: `${left}%`, 
                width: `${Math.max(0.5, width)}%`,
              }}
            />
          );
        })}
      </div>
      
      {/* Playhead */}
      <motion.div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
        style={{ left: `${playheadPosition}%` }}
        animate={{ left: `${playheadPosition}%` }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
      
      {/* Hover indicator */}
      <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-colors" />
      
      {/* Time labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[8px] text-white/60 font-mono">
        <span>0:00</span>
        <span>{formatTime(totalDuration / 2)}</span>
        <span>{formatTime(totalDuration)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default TimelineHeatmap;
