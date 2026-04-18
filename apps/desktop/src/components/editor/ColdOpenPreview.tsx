/**
 * ColdOpenPreview - A/B testing component for cold open variations
 * 
 * Displays side-by-side or tabbed previews of different cold open variations,
 * allowing users to compare and select the best hook.
 */

import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RefreshCw,
  Check,
  Sparkles,
  Clock,
  ArrowRight,
  Trophy,
  Beaker,
} from 'lucide-react';

interface TimelineItem {
  type: 'hook' | 'segment' | 'transition';
  start?: number;
  end?: number;
  duration?: number;
  text?: string;
  effect?: string;
  label?: string;
}

interface ColdOpenVariation {
  id: string;
  style: string;
  hook_text: string;
  hook_score: number;
  hook_start: number;
  hook_end: number;
  predicted_retention: number;
  reasons: string[];
  timeline: TimelineItem[];
  is_control: boolean;
}

interface ColdOpenPreviewProps {
  variations: ColdOpenVariation[];
  videoSrc: string;
  onSelect: (variationId: string) => void;
  selectedVariationId?: string;
}

export function ColdOpenPreview({
  variations,
  videoSrc,
  onSelect,
  selectedVariationId,
}: ColdOpenPreviewProps) {
  const [activeTab, setActiveTab] = useState<string>(variations[0]?.id || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<'tabs' | 'compare'>('tabs');
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  // Sort variations by predicted retention
  const sortedVariations = useMemo(() => {
    return [...variations].sort((a, b) => b.predicted_retention - a.predicted_retention);
  }, [variations]);

  // Get the recommended variation (highest predicted retention, not control)
  const recommended = useMemo(() => {
    return sortedVariations.find(v => !v.is_control) || sortedVariations[0];
  }, [sortedVariations]);

  // Active variation
  const activeVariation = useMemo(() => {
    return variations.find(v => v.id === activeTab) || variations[0];
  }, [variations, activeTab]);

  // Play/pause handler
  const handlePlayPause = (variationId?: string) => {
    const id = variationId || activeTab;
    const video = videoRefs.current[id];
    
    if (video) {
      if (video.paused) {
        // Pause all other videos
        Object.entries(videoRefs.current).forEach(([key, v]) => {
          if (key !== id && v) v.pause();
        });
        video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  };

  // Reset handler
  const handleReset = (variationId?: string) => {
    const id = variationId || activeTab;
    const video = videoRefs.current[id];
    
    if (video) {
      video.currentTime = 0;
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--accent-color)]/20 rounded-lg">
            <Sparkles className="w-5 h-5 text-[var(--accent-color)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Cold Open Engine</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {variations.length} variations générées • Comparez et sélectionnez
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              viewMode === 'tabs'
                ? 'bg-[var(--accent-color)] text-white'
                : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
            }`}
            onClick={() => setViewMode('tabs')}
          >
            Onglets
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              viewMode === 'compare'
                ? 'bg-[var(--accent-color)] text-white'
                : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
            }`}
            onClick={() => setViewMode('compare')}
          >
            Comparer
          </button>
        </div>
      </div>

      {viewMode === 'tabs' ? (
        <>
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {sortedVariations.map((variation) => (
              <button
                key={variation.id}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all relative ${
                  activeTab === variation.id
                    ? 'text-[var(--text-primary)] bg-white/5'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                onClick={() => setActiveTab(variation.id)}
              >
                <div className="flex items-center justify-center gap-2">
                  {variation.is_control ? (
                    <>
                      <Beaker className="w-4 h-4" />
                      <span>Original</span>
                    </>
                  ) : (
                    <>
                      {variation.id === recommended?.id && (
                        <Trophy className="w-4 h-4 text-amber-400" />
                      )}
                      <span>{variation.style === 'hard_cut' ? 'Hard Cut' : 'Text Overlay'}</span>
                    </>
                  )}
                </div>
                
                {activeTab === variation.id && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-color)]"
                    layoutId="activeTab"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Active Variation Preview */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4"
            >
              <VariationCard
                variation={activeVariation}
                videoSrc={videoSrc}
                isRecommended={activeVariation.id === recommended?.id}
                isSelected={selectedVariationId === activeVariation.id}
                onSelect={() => onSelect(activeVariation.id)}
                videoRef={(el) => { videoRefs.current[activeVariation.id] = el; }}
                isPlaying={isPlaying && activeTab === activeVariation.id}
                onPlayPause={() => handlePlayPause(activeVariation.id)}
                onReset={() => handleReset(activeVariation.id)}
              />
            </motion.div>
          </AnimatePresence>
        </>
      ) : (
        /* Compare View - Side by Side */
        <div className="p-4 grid grid-cols-2 gap-4">
          {sortedVariations.slice(0, 2).map((variation) => (
            <VariationCard
              key={variation.id}
              variation={variation}
              videoSrc={videoSrc}
              isRecommended={variation.id === recommended?.id}
              isSelected={selectedVariationId === variation.id}
              onSelect={() => onSelect(variation.id)}
              videoRef={(el) => { videoRefs.current[variation.id] = el; }}
              isPlaying={isPlaying}
              onPlayPause={() => handlePlayPause(variation.id)}
              onReset={() => handleReset(variation.id)}
              compact
            />
          ))}
        </div>
      )}

      {/* Summary Bar */}
      <div className="p-4 border-t border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-[var(--text-muted)]">Recommandé:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {recommended?.is_control ? 'Original' : recommended?.style}
              </span>
            </div>
            <div className="text-[var(--text-muted)]">
              Score hook: <span className="text-[var(--accent-color)]">{recommended?.hook_score}</span>
            </div>
          </div>

          <button
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedVariationId
                ? 'bg-[var(--accent-color)] text-white'
                : 'bg-white/10 text-[var(--text-secondary)]'
            }`}
            onClick={() => onSelect(recommended?.id || 'control')}
            disabled={!recommended}
          >
            {selectedVariationId === recommended?.id ? (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Sélectionné
              </span>
            ) : (
              'Appliquer recommandation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VariationCardProps {
  variation: ColdOpenVariation;
  videoSrc: string;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: () => void;
  videoRef: (el: HTMLVideoElement | null) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  compact?: boolean;
}

function VariationCard({
  variation,
  videoSrc,
  isRecommended,
  isSelected,
  onSelect,
  videoRef,
  isPlaying,
  onPlayPause,
  onReset,
  compact = false,
}: VariationCardProps) {
  // Calculate timeline visualization
  const timelineSegments = useMemo(() => {
    let currentOffset = 0;
    return variation.timeline.map((item, _i) => {
      const duration = item.duration || (item.end && item.start ? item.end - item.start : 0);
      const segment = {
        ...item,
        offset: currentOffset,
        width: duration,
      };
      currentOffset += duration;
      return segment;
    });
  }, [variation.timeline]);

  const totalDuration = timelineSegments.reduce((acc, s) => acc + s.width, 0);

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all ${
        isSelected
          ? 'ring-2 ring-[var(--accent-color)] bg-[var(--accent-color)]/10'
          : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      {/* Video Preview */}
      <div className={`relative ${compact ? 'aspect-[9/10]' : 'aspect-video'} bg-black`}>
        <video
          ref={videoRef}
          src={`${videoSrc}#t=${variation.hook_start}`}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
        
        {/* Play overlay */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
            onClick={onPlayPause}
          >
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
              <Play className="w-6 h-6 text-white ml-1" />
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-2">
          {isRecommended && (
            <span className="px-2 py-1 bg-amber-500/90 backdrop-blur-sm rounded text-xs font-medium text-white flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Recommandé
            </span>
          )}
          {variation.is_control && (
            <span className="px-2 py-1 bg-gray-600/90 backdrop-blur-sm rounded text-xs font-medium text-white flex items-center gap-1">
              <Beaker className="w-3 h-3" />
              Control
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="absolute bottom-2 right-2 flex gap-2">
          <button
            className="p-2 bg-black/50 backdrop-blur-sm rounded-lg hover:bg-black/70 transition-colors"
            onClick={onPlayPause}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-white" />
            ) : (
              <Play className="w-4 h-4 text-white" />
            )}
          </button>
          <button
            className="p-2 bg-black/50 backdrop-blur-sm rounded-lg hover:bg-black/70 transition-colors"
            onClick={onReset}
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className={compact ? 'p-3' : 'p-4'}>
        {/* Hook Text */}
        <div className="mb-3">
          <p className={`text-[var(--text-primary)] font-medium ${compact ? 'text-sm line-clamp-2' : ''}`}>
            "{variation.hook_text}"
          </p>
        </div>

        {/* Timeline Visualization */}
        {!compact && (
          <div className="mb-3">
            <div className="flex items-center gap-1 h-6 rounded-lg overflow-hidden">
              {timelineSegments.map((segment, i) => (
                <div
                  key={i}
                  className={`h-full flex items-center justify-center text-[10px] font-medium ${
                    segment.type === 'hook'
                      ? 'bg-[var(--accent-color)] text-white'
                      : segment.type === 'transition'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-600 text-gray-300'
                  }`}
                  style={{ flex: segment.width / totalDuration }}
                >
                  {segment.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className={`flex items-center gap-4 text-sm ${compact ? 'text-xs' : ''}`}>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[var(--accent-color)]" />
            <span className="text-[var(--text-muted)]">Hook:</span>
            <span className="font-medium text-[var(--text-primary)]">{variation.hook_score}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-[var(--text-muted)]">
              {((variation.hook_end - variation.hook_start)).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Reasons */}
        {!compact && variation.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {variation.reasons.slice(0, 3).map((reason, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-white/10 rounded text-xs text-[var(--text-muted)]"
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        {/* Select Button */}
        <button
          className={`mt-3 w-full py-2 rounded-lg font-medium text-sm transition-all ${
            isSelected
              ? 'bg-[var(--accent-color)] text-white'
              : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20'
          }`}
          onClick={onSelect}
        >
          {isSelected ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />
              Sélectionné
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              Choisir cette version
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default ColdOpenPreview;
