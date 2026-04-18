/**
 * Multi-Track Timeline with Keyframe Support
 * 
 * Features:
 * - Multiple tracks (video, audio, subtitles, effects)
 * - Keyframe editing for zoom/pan animations
 * - Drag-and-drop clip arrangement
 * - Zoom and scroll navigation
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, 
  ZoomIn, Plus, Minus,
  Volume2, VolumeX, Type, Film,
  Sparkles, Diamond, Trash2
} from 'lucide-react';

// Types
export interface Keyframe {
  id: string;
  time: number; // Time in seconds
  value: number; // Value at this keyframe (0-100)
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle' | 'effect' | 'zoom' | 'pan';
  color: string;
  muted: boolean;
  locked: boolean;
  keyframes: Keyframe[];
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  name: string;
  color?: string;
  data?: any;
}

interface MultiTrackTimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  isPlaying: boolean;
  tracks?: TimelineTrack[];
  onTracksChange?: (tracks: TimelineTrack[]) => void;
  onKeyframeAdd?: (trackId: string, time: number) => void;
  onKeyframeChange?: (trackId: string, keyframeId: string, value: number) => void;
  onKeyframeDelete?: (trackId: string, keyframeId: string) => void;
}

// Default tracks for 9:16 editing
const DEFAULT_TRACKS: TimelineTrack[] = [
  {
    id: 'video',
    name: 'Video',
    type: 'video',
    color: '#3B82F6',
    muted: false,
    locked: false,
    keyframes: [],
    clips: []
  },
  {
    id: 'zoom',
    name: 'Zoom',
    type: 'zoom',
    color: '#F59E0B',
    muted: false,
    locked: false,
    keyframes: [
      { id: 'z1', time: 0, value: 100, easing: 'linear' }
    ],
    clips: []
  },
  {
    id: 'pan-x',
    name: 'Pan X',
    type: 'pan',
    color: '#8B5CF6',
    muted: false,
    locked: false,
    keyframes: [
      { id: 'px1', time: 0, value: 50, easing: 'linear' }
    ],
    clips: []
  },
  {
    id: 'audio-main',
    name: 'Audio',
    type: 'audio',
    color: '#10B981',
    muted: false,
    locked: false,
    keyframes: [
      { id: 'a1', time: 0, value: 100, easing: 'linear' }
    ],
    clips: []
  },
  {
    id: 'music',
    name: 'Music',
    type: 'audio',
    color: '#EC4899',
    muted: false,
    locked: false,
    keyframes: [],
    clips: []
  },
  {
    id: 'subtitles',
    name: 'Subtitles',
    type: 'subtitle',
    color: '#F97316',
    muted: false,
    locked: false,
    keyframes: [],
    clips: []
  }
];

export function MultiTrackTimeline({
  duration,
  currentTime,
  onSeek,
  onPlay,
  onPause,
  isPlaying,
  tracks = DEFAULT_TRACKS,
  onTracksChange,
  onKeyframeAdd,
  onKeyframeChange,
  onKeyframeDelete
}: MultiTrackTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null);
  const [, /* isDragging */ ] = useState(false);
  
  // Calculate pixels per second based on zoom
  const pxPerSecond = 50 * zoom;
  const timelineWidth = duration * pxPerSecond;
  
  // Format time display
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  // Handle timeline click for seeking
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX - 120; // Account for track labels
    const time = Math.max(0, Math.min(duration, x / pxPerSecond));
    onSeek(time);
  }, [duration, pxPerSecond, scrollX, onSeek]);
  
  // Handle keyframe drag
  const handleKeyframeDrag = useCallback((
    trackId: string,
    keyframeId: string,
    deltaY: number
  ) => {
    if (!onKeyframeChange) return;
    
    const track = tracks.find(t => t.id === trackId);
    const keyframe = track?.keyframes.find(k => k.id === keyframeId);
    if (!keyframe) return;
    
    // Convert delta to value change (inverted, up = higher value)
    const valueDelta = -deltaY / 2;
    const newValue = Math.max(0, Math.min(100, keyframe.value + valueDelta));
    
    onKeyframeChange(trackId, keyframeId, newValue);
  }, [tracks, onKeyframeChange]);
  
  // Add keyframe at current time
  const handleAddKeyframe = useCallback((trackId: string) => {
    if (!onKeyframeAdd) return;
    onKeyframeAdd(trackId, currentTime);
  }, [currentTime, onKeyframeAdd]);
  
  // Delete selected keyframe
  const handleDeleteKeyframe = useCallback(() => {
    if (!selectedKeyframe || !onKeyframeDelete) return;
    onKeyframeDelete(selectedKeyframe.trackId, selectedKeyframe.keyframeId);
    setSelectedKeyframe(null);
  }, [selectedKeyframe, onKeyframeDelete]);
  
  // Toggle track mute
  const toggleMute = (trackId: string) => {
    if (!onTracksChange) return;
    const newTracks = tracks.map(t => 
      t.id === trackId ? { ...t, muted: !t.muted } : t
    );
    onTracksChange(newTracks);
  };
  
  // Zoom controls
  const handleZoomIn = () => setZoom(z => Math.min(4, z * 1.5));
  const handleZoomOut = () => setZoom(z => Math.max(0.25, z / 1.5));
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedKeyframe) {
        handleDeleteKeyframe();
      }
      if (e.key === 'k') {
        if (selectedTrack) {
          handleAddKeyframe(selectedTrack);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeyframe, selectedTrack, handleDeleteKeyframe, handleAddKeyframe]);
  
  // Render keyframe curve for a track
  const renderKeyframeCurve = (track: TimelineTrack) => {
    if (track.keyframes.length === 0) return null;
    
    const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);
    const points = sorted.map(k => ({
      x: k.time * pxPerSecond,
      y: 40 - (k.value / 100) * 36, // Map 0-100 to 36-0 (within 40px track height)
    }));
    
    // Create SVG path
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    return (
      <svg 
        className="absolute inset-0 pointer-events-none"
        style={{ width: timelineWidth, height: 40 }}
      >
        <path
          d={path}
          fill="none"
          stroke={track.color}
          strokeWidth={2}
          strokeOpacity={0.7}
        />
      </svg>
    );
  };
  
  // Get track icon
  const getTrackIcon = (type: TimelineTrack['type']) => {
    switch (type) {
      case 'video': return <Film className="w-4 h-4" />;
      case 'audio': return <Volume2 className="w-4 h-4" />;
      case 'subtitle': return <Type className="w-4 h-4" />;
      case 'zoom': return <ZoomIn className="w-4 h-4" />;
      case 'pan': return <Sparkles className="w-4 h-4" />;
      case 'effect': return <Diamond className="w-4 h-4" />;
      default: return <Film className="w-4 h-4" />;
    }
  };
  
  return (
    <div className="flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {/* Playback controls */}
          <button
            onClick={() => onSeek(0)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={isPlaying ? onPause : onPlay}
            className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onSeek(duration)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          
          {/* Time display */}
          <span className="ml-4 font-mono text-sm text-gray-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          
          {/* Add keyframe */}
          {selectedTrack && (
            <button
              onClick={() => handleAddKeyframe(selectedTrack)}
              className="ml-4 px-3 py-1 bg-cyan-600/20 text-cyan-400 rounded text-sm hover:bg-cyan-600/30 transition-colors"
            >
              + Keyframe
            </button>
          )}
        </div>
      </div>
      
      {/* Timeline area */}
      <div 
        ref={containerRef}
        className="relative flex overflow-hidden"
        style={{ height: tracks.length * 44 + 30 }}
      >
        {/* Track labels (fixed) */}
        <div className="flex-shrink-0 w-[120px] bg-gray-800/80 border-r border-gray-700 z-10">
          {/* Time ruler header */}
          <div className="h-[30px] border-b border-gray-700" />
          
          {/* Track labels */}
          {tracks.map(track => (
            <div
              key={track.id}
              className={`h-[44px] flex items-center gap-2 px-2 border-b border-gray-700/50 cursor-pointer transition-colors
                ${selectedTrack === track.id ? 'bg-gray-700/50' : 'hover:bg-gray-700/30'}`}
              onClick={() => setSelectedTrack(track.id)}
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: track.color }}
              />
              {getTrackIcon(track.type)}
              <span className="text-xs text-gray-300 truncate flex-1">
                {track.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
                className={`p-1 rounded ${track.muted ? 'text-red-400' : 'text-gray-400'} hover:bg-gray-600`}
              >
                {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
        
        {/* Scrollable timeline content */}
        <div 
          className="flex-1 overflow-x-auto relative"
          onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
        >
          {/* Time ruler */}
          <div 
            className="h-[30px] bg-gray-800/50 border-b border-gray-700 relative"
            style={{ width: timelineWidth }}
          >
            {/* Time markers */}
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: i * pxPerSecond }}
              >
                <div className="h-2 w-px bg-gray-600" />
                <span className="text-[10px] text-gray-500 mt-0.5">
                  {Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
          
          {/* Tracks */}
          {tracks.map(track => (
            <div
              key={track.id}
              className={`h-[44px] relative border-b border-gray-700/50
                ${selectedTrack === track.id ? 'bg-gray-800/30' : ''}`}
              style={{ width: timelineWidth }}
              onClick={handleTimelineClick}
            >
              {/* Keyframe curve */}
              {renderKeyframeCurve(track)}
              
              {/* Keyframe diamonds */}
              {track.keyframes.map(keyframe => (
                <motion.div
                  key={keyframe.id}
                  className={`absolute cursor-pointer z-10
                    ${selectedKeyframe?.keyframeId === keyframe.id 
                      ? 'ring-2 ring-cyan-400' : ''}`}
                  style={{
                    left: keyframe.time * pxPerSecond - 6,
                    top: 40 - (keyframe.value / 100) * 36 - 6,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKeyframe({ trackId: track.id, keyframeId: keyframe.id });
                  }}
                  drag="y"
                  dragConstraints={{ top: -20, bottom: 20 }}
                  dragElastic={0}
                  onDrag={(_, info) => {
                    handleKeyframeDrag(track.id, keyframe.id, info.delta.y);
                  }}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Diamond 
                    className="w-3 h-3 fill-current"
                    style={{ color: track.color }}
                  />
                </motion.div>
              ))}
              
              {/* Clips on this track */}
              {track.clips.map(clip => (
                <div
                  key={clip.id}
                  className="absolute top-1 bottom-1 rounded overflow-hidden"
                  style={{
                    left: clip.startTime * pxPerSecond,
                    width: clip.duration * pxPerSecond,
                    backgroundColor: clip.color || track.color,
                    opacity: 0.7,
                  }}
                >
                  <span className="text-[10px] px-1 text-white truncate">
                    {clip.name}
                  </span>
                </div>
              ))}
            </div>
          ))}
          
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
            style={{ left: currentTime * pxPerSecond }}
          >
            <div className="absolute -top-1 -left-1.5 w-4 h-3 bg-red-500" 
              style={{ clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)' }}
            />
          </div>
        </div>
      </div>
      
      {/* Keyframe properties panel */}
      <AnimatePresence>
        {selectedKeyframe && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-700 overflow-hidden"
          >
            <div className="p-3 bg-gray-800/50 flex items-center gap-4">
              <span className="text-sm text-gray-400">Keyframe:</span>
              
              {/* Value slider */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-gray-500">Value:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={
                    tracks
                      .find(t => t.id === selectedKeyframe.trackId)
                      ?.keyframes.find(k => k.id === selectedKeyframe.keyframeId)
                      ?.value || 50
                  }
                  onChange={(e) => {
                    if (onKeyframeChange) {
                      onKeyframeChange(
                        selectedKeyframe.trackId,
                        selectedKeyframe.keyframeId,
                        parseInt(e.target.value)
                      );
                    }
                  }}
                  className="flex-1 accent-cyan-500"
                />
                <span className="text-xs text-gray-400 w-8">
                  {tracks
                    .find(t => t.id === selectedKeyframe.trackId)
                    ?.keyframes.find(k => k.id === selectedKeyframe.keyframeId)
                    ?.value || 0}%
                </span>
              </div>
              
              {/* Delete button */}
              <button
                onClick={handleDeleteKeyframe}
                className="p-1.5 text-red-400 hover:bg-red-400/20 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MultiTrackTimeline;
