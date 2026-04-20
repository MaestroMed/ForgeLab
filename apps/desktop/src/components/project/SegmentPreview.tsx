import { useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { mediaUrl } from '@/lib/config';
import { TimelineHeatmap } from '@/components/segments/TimelineHeatmap';

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  topicLabel?: string;
  /**
   * Sentence-level transcript boundaries from Whisper / analysis.
   * Each entry carries at minimum a ``start`` timestamp (seconds, relative
   * to the segment start). Shape is tolerant because different backends
   * emit slightly different keys.
   */
  transcriptSegments?: Array<{
    start?: number;
    end?: number;
    [key: string]: unknown;
  }>;
  /** Optional direct scene-change timestamps (seconds, absolute). */
  sceneChanges?: number[];
}

interface SegmentPreviewProps {
  project: {
    id: string;
    duration?: number;
    proxy_path?: string;
    source_path?: string;
  };
  segments: Segment[];
  selectedSegment: Segment | null;
  isPlaying: boolean;
  currentTime: number;
  isMuted: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onMuteToggle: () => void;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SegmentPreview({
  project,
  segments,
  selectedSegment,
  isPlaying,
  currentTime,
  isMuted,
  onPlayPause,
  onSeek,
  onMuteToggle,
  onTimeUpdate,
  onEnded,
  videoRef,
}: SegmentPreviewProps) {
  const videoSrc = project.proxy_path || project.source_path;

  // Derive chapter markers for the scrubber from whatever the active segment
  // carries — prefer explicit scene-change timestamps, otherwise fall back to
  // sentence boundaries from the transcript. Markers are absolute (seconds on
  // the full project timeline) so they line up with the scrubber.
  const chapterMarkers = useMemo<number[]>(() => {
    if (!selectedSegment) return [];

    const scenes = selectedSegment.sceneChanges;
    if (Array.isArray(scenes) && scenes.length > 0) {
      return scenes
        .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
        .filter((t) => t >= selectedSegment.startTime && t <= selectedSegment.endTime);
    }

    const sentences = selectedSegment.transcriptSegments;
    if (Array.isArray(sentences) && sentences.length > 0) {
      const out: number[] = [];
      for (const s of sentences) {
        const start = typeof s?.start === 'number' ? s.start : null;
        if (start === null) continue;
        // Heuristic: transcript timestamps can be absolute (Whisper-style)
        // or relative to the segment. If the value is smaller than the
        // segment duration, assume it's relative and offset it.
        const absolute =
          start > selectedSegment.endTime ? start : selectedSegment.startTime + start;
        if (absolute >= selectedSegment.startTime && absolute <= selectedSegment.endTime) {
          out.push(absolute);
        }
      }
      // Skip the very first boundary — that's just the segment start.
      return out.slice(1);
    }

    return [];
  }, [selectedSegment]);

  const totalDuration = project.duration || 0;

  // Update time display
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => onTimeUpdate(video.currentTime);
    const handleEnded = () => onEnded();

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onEnded]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Video area */}
      <div className="flex-1 bg-black flex items-center justify-center relative">
        {videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={mediaUrl(project.id, 'proxy')}
              className="max-h-full max-w-full"
              muted={isMuted}
              onClick={onPlayPause}
            />

            {/* Overlay info */}
            {selectedSegment && (
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm">
                <div className="font-medium">{selectedSegment.topicLabel || 'Segment'}</div>
                <div className="text-xs opacity-70">
                  {formatTime(selectedSegment.startTime)} → {formatTime(selectedSegment.endTime)}
                </div>
              </div>
            )}

            {/* Time indicator */}
            <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-sm font-mono">
              {formatTime(currentTime)} / {formatTime(project.duration || 0)}
            </div>
          </>
        ) : (
          <div className="text-[var(--text-muted)]">Aucune vidéo disponible</div>
        )}
      </div>

      {/* Controls bar */}
      <div className="h-16 bg-[var(--bg-card)] border-t border-[var(--border-color)] flex items-center px-4 gap-4">
        {/* Play controls */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
          >
            <SkipBack className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <button
            className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            onClick={onPlayPause}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            onClick={() => onSeek(currentTime + 10)}
          >
            <SkipForward className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Timeline with Heatmap */}
        <div className="flex-1 flex flex-col gap-1">
          {/* Segment Heatmap */}
          <TimelineHeatmap
            segments={segments}
            totalDuration={project.duration || 0}
            currentTime={currentTime}
            onSeek={onSeek}
            height={24}
            className="rounded"
          />

          {/* Progress scrubber */}
          <div className="relative h-1 bg-[var(--bg-tertiary)] rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              onSeek(pct * (project.duration || 0));
            }}
          >
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
              style={{ width: `${(currentTime / (project.duration || 1)) * 100}%` }}
            />

            {/* Selected segment highlight */}
            {selectedSegment && (
              <div
                className="absolute inset-y-0 bg-green-500/50 rounded-full"
                style={{
                  left: `${(selectedSegment.startTime / (project.duration || 1)) * 100}%`,
                  width: `${((selectedSegment.endTime - selectedSegment.startTime) / (project.duration || 1)) * 100}%`,
                }}
              />
            )}
          </div>

          {/* Chapter markers — scene changes or sentence boundaries from the
              active segment. Each tick seeks the video on click. */}
          {chapterMarkers.length > 0 && totalDuration > 0 && (
            <div className="relative w-full h-1">
              {chapterMarkers.map((t, i) => (
                <div
                  key={`${t}-${i}`}
                  className="absolute top-0 w-0.5 h-1 bg-amber-400/70 hover:bg-amber-300 cursor-pointer"
                  style={{ left: `${(t / totalDuration) * 100}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (videoRef.current) {
                      videoRef.current.currentTime = t;
                      onSeek(t);
                    }
                  }}
                  title={`Chapitre ${i + 1} — ${formatTime(t)}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Volume */}
        <button
          className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          onClick={onMuteToggle}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-[var(--text-secondary)]" />
          ) : (
            <Volume2 className="w-5 h-5 text-[var(--text-secondary)]" />
          )}
        </button>
      </div>
    </div>
  );
}
