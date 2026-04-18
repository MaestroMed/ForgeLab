/**
 * VideoPlayer - Professional video player component with frame-accurate controls
 * 
 * Features:
 * - Frame-accurate seeking and scrubbing
 * - Keyboard shortcuts
 * - Playback speed control
 * - Waveform-synced timeline
 * - Frame counter display
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  Volume2,
  VolumeX,
  Maximize2,
  Settings,
} from 'lucide-react';
import { useVideoSync, VideoSyncController } from '@/hooks/useVideoSync';

interface VideoPlayerProps {
  src: string;
  clipStartTime?: number;
  clipEndTime?: number;
  fps?: number;
  showControls?: boolean;
  showTimecode?: boolean;
  showFrameCounter?: boolean;
  waveformData?: number[];
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onReady?: (controller: VideoSyncController) => void;
}

export interface VideoPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  getController: () => VideoSyncController;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  src,
  clipStartTime = 0,
  clipEndTime,
  fps = 30,
  showControls = true,
  showTimecode = true,
  showFrameCounter = false,
  waveformData,
  className = '',
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onReady,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [, setIsFullscreen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const controller = useVideoSync({
    initialTime: clipStartTime,
    clipStartTime,
    clipEndTime,
    fps,
    onTimeUpdate,
    onPlay,
    onPause,
    onEnded,
  });

  const { state, videoRef, play, pause, togglePlay, seek, seekRelative, stepForward, stepBackward, setPlaybackRate } = controller;

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    play,
    pause,
    seek,
    getCurrentTime: () => state.currentTime,
    getDuration: () => state.duration,
    isPlaying: () => state.isPlaying,
    getController: () => controller,
  }), [controller, state, play, pause, seek]);

  // Notify when ready
  useEffect(() => {
    if (state.isLoaded && onReady) {
      onReady(controller);
    }
  }, [state.isLoaded, controller, onReady]);

  // Volume control
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, videoRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            seekRelative(-5);
          } else if (e.ctrlKey || e.metaKey) {
            stepBackward();
          } else {
            seekRelative(-1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            seekRelative(5);
          } else if (e.ctrlKey || e.metaKey) {
            stepForward();
          } else {
            seekRelative(1);
          }
          break;
        case 'Home':
          e.preventDefault();
          seek(clipStartTime);
          break;
        case 'End':
          e.preventDefault();
          seek(clipEndTime || state.duration);
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(m => !m);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case ',':
          e.preventDefault();
          stepBackward();
          break;
        case '.':
          e.preventDefault();
          stepForward();
          break;
        case 'j':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'l':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, stepForward, stepBackward, seek, clipStartTime, clipEndTime, state.duration]);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls
  const handleMouseMove = useCallback(() => {
    setIsHovering(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (state.isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setIsHovering(false);
      }, 2000);
    }
  }, [state.isPlaying]);

  // Progress bar calculations
  const effectiveDuration = (clipEndTime || state.duration) - clipStartTime;
  const effectiveTime = state.currentTime - clipStartTime;
  const progressPercent = effectiveDuration > 0 ? (effectiveTime / effectiveDuration) * 100 : 0;
  const currentFrame = Math.floor(state.currentTime * fps);

  // Seek from progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = clipStartTime + percent * effectiveDuration;
    seek(newTime);
  }, [clipStartTime, effectiveDuration, seek]);

  // Speed options
  const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden select-none group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        playsInline
        preload="auto"
      />

      {/* Loading Indicator */}
      {!state.isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Seeking Indicator */}
      {state.isSeeking && (
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-lg text-sm text-white">
          Seeking...
        </div>
      )}

      {/* Play/Pause Center Overlay */}
      {!state.isPlaying && isHovering && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <Play className="w-10 h-10 text-white ml-1" />
          </div>
        </motion.div>
      )}

      {/* Timecode Display (Top Right) */}
      {showTimecode && (
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className="px-2.5 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-sm text-white font-mono">
            {formatTimecode(state.currentTime, fps)}
          </div>
          {showFrameCounter && (
            <div className="px-2.5 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-sm text-white/70 font-mono">
              F:{currentFrame}
            </div>
          )}
        </div>
      )}

      {/* Controls Bar */}
      {showControls && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-12 pb-2 px-4"
          initial={false}
          animate={{ opacity: isHovering || !state.isPlaying ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Progress Bar */}
          <div
            className="relative h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 group/progress"
            onClick={handleProgressClick}
          >
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
              style={{ width: `${((state.buffered - clipStartTime) / effectiveDuration) * 100}%` }}
            />
            
            {/* Progress */}
            <motion.div
              className="absolute top-0 left-0 h-full bg-white rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            
            {/* Hover indicator */}
            <div className="absolute -top-0.5 -bottom-0.5 left-0 right-0 rounded-full group-hover/progress:bg-white/10" />
            
            {/* Scrubber head */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />

            {/* Waveform overlay */}
            {waveformData && waveformData.length > 0 && (
              <div className="absolute -top-6 left-0 right-0 h-6 flex items-end pointer-events-none opacity-50">
                {waveformData.slice(0, 100).map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-white/40 mx-px rounded-t"
                    style={{ height: `${v * 100}%` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-1">
              {/* Skip back */}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => seek(clipStartTime)}
                title="Début (Home)"
              >
                <ChevronsLeft className="w-5 h-5 text-white" />
              </button>

              {/* Step back */}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={stepBackward}
                title="Frame précédente (,)"
              >
                <SkipBack className="w-5 h-5 text-white" />
              </button>

              {/* Play/Pause */}
              <button
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                onClick={togglePlay}
                title="Lecture/Pause (Espace)"
              >
                {state.isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" />
                )}
              </button>

              {/* Step forward */}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={stepForward}
                title="Frame suivante (.)"
              >
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              {/* Skip forward */}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => seek(clipEndTime || state.duration)}
                title="Fin (End)"
              >
                <ChevronsRight className="w-5 h-5 text-white" />
              </button>

              {/* Time display */}
              <div className="ml-3 text-sm text-white/80 font-mono">
                <span>{formatTime(effectiveTime)}</span>
                <span className="text-white/40 mx-1">/</span>
                <span className="text-white/60">{formatTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1">
              {/* Volume */}
              <div
                className="relative flex items-center"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  onClick={() => setIsMuted(m => !m)}
                  title="Muet (M)"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-white" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-white" />
                  )}
                </button>

                {showVolumeSlider && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 80 }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden"
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(Number(e.target.value));
                        setIsMuted(false);
                      }}
                      className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                  </motion.div>
                )}
              </div>

              {/* Playback Speed */}
              <div className="relative">
                <button
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1"
                  onClick={() => setShowSpeedMenu(s => !s)}
                  title="Vitesse de lecture"
                >
                  <Settings className="w-4 h-4 text-white" />
                  <span className="text-xs text-white/80">{state.playbackRate}x</span>
                </button>

                {showSpeedMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl"
                  >
                    {speedOptions.map(speed => (
                      <button
                        key={speed}
                        className={`block w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors ${
                          state.playbackRate === speed ? 'text-blue-400' : 'text-white'
                        }`}
                        onClick={() => {
                          setPlaybackRate(speed);
                          setShowSpeedMenu(false);
                        }}
                      >
                        {speed}x
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Fullscreen */}
              <button
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={toggleFullscreen}
                title="Plein écran (F)"
              >
                <Maximize2 className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

// Format time as MM:SS.ms
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

// Format as SMPTE timecode HH:MM:SS:FF
function formatTimecode(seconds: number, fps: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export default VideoPlayer;
