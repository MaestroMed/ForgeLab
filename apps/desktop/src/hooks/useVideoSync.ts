/**
 * useVideoSync - Frame-accurate video synchronization hook
 * 
 * Provides a unified video playback controller for multiple video elements,
 * ensuring frame-accurate synchronization across all views.
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface VideoState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isSeeking: boolean;
  isLoaded: boolean;
  buffered: number;
  playbackRate: number;
}

export interface VideoSyncController {
  state: VideoState;
  videoRef: React.RefObject<HTMLVideoElement>;
  // Controls
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  // Frame-accurate controls
  stepForward: () => void;
  stepBackward: () => void;
  seekToFrame: (frame: number, fps?: number) => void;
  // Sync helpers
  syncVideo: (video: HTMLVideoElement) => void;
  getTimeForFrame: (frame: number, fps?: number) => number;
  getFrameForTime: (time: number, fps?: number) => number;
}

interface UseVideoSyncOptions {
  initialTime?: number;
  clipStartTime?: number;
  clipEndTime?: number;
  fps?: number;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

const DEFAULT_FPS = 30;
const SYNC_THRESHOLD = 0.05; // 50ms threshold for sync

export function useVideoSync(options: UseVideoSyncOptions = {}): VideoSyncController {
  const {
    initialTime = 0,
    clipStartTime = 0,
    clipEndTime,
    fps = DEFAULT_FPS,
    onTimeUpdate,
    onEnded,
    onPlay,
    onPause,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const syncedVideosRef = useRef<Set<HTMLVideoElement>>(new Set());
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(initialTime);

  const [state, setState] = useState<VideoState>({
    currentTime: initialTime,
    duration: 0,
    isPlaying: false,
    isSeeking: false,
    isLoaded: false,
    buffered: 0,
    playbackRate: 1,
  });

  // Frame time calculation
  const frameTime = 1 / fps;

  // Get time for specific frame
  const getTimeForFrame = useCallback((frame: number, customFps?: number): number => {
    const targetFps = customFps || fps;
    return frame / targetFps;
  }, [fps]);

  // Get frame for specific time
  const getFrameForTime = useCallback((time: number, customFps?: number): number => {
    const targetFps = customFps || fps;
    return Math.floor(time * targetFps);
  }, [fps]);

  // Update loop using requestAnimationFrame for smooth updates
  const updateLoop = useCallback(() => {
    if (videoRef.current && state.isPlaying) {
      const currentTime = videoRef.current.currentTime;
      
      // Only update if time changed significantly
      if (Math.abs(currentTime - lastTimeRef.current) > 0.016) {
        lastTimeRef.current = currentTime;
        
        setState(prev => ({ ...prev, currentTime }));
        onTimeUpdate?.(currentTime);
        
        // Sync all registered videos
        syncedVideosRef.current.forEach(video => {
          if (Math.abs(video.currentTime - currentTime) > SYNC_THRESHOLD) {
            video.currentTime = currentTime;
          }
        });

        // Check clip end
        if (clipEndTime && currentTime >= clipEndTime) {
          videoRef.current.pause();
          videoRef.current.currentTime = clipStartTime;
          setState(prev => ({ ...prev, isPlaying: false, currentTime: clipStartTime }));
          onEnded?.();
          return;
        }
      }
      
      rafRef.current = requestAnimationFrame(updateLoop);
    }
  }, [state.isPlaying, clipStartTime, clipEndTime, onTimeUpdate, onEnded]);

  // Start/stop the update loop based on playing state
  useEffect(() => {
    if (state.isPlaying) {
      rafRef.current = requestAnimationFrame(updateLoop);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [state.isPlaying, updateLoop]);

  // Play
  const play = useCallback(async () => {
    if (!videoRef.current) return;
    
    try {
      await videoRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
      
      // Sync all registered videos
      syncedVideosRef.current.forEach(video => {
        video.play().catch(() => {});
      });
      
      onPlay?.();
    } catch (error) {
      console.warn('Video play failed:', error);
    }
  }, [onPlay]);

  // Pause
  const pause = useCallback(() => {
    if (!videoRef.current) return;
    
    videoRef.current.pause();
    setState(prev => ({ ...prev, isPlaying: false }));
    
    // Pause all synced videos
    syncedVideosRef.current.forEach(video => {
      video.pause();
    });
    
    onPause?.();
  }, [onPause]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  // Seek to specific time
  const seek = useCallback((time: number) => {
    if (!videoRef.current) return;
    
    // Clamp to valid range
    const clampedTime = Math.max(
      clipStartTime,
      Math.min(clipEndTime || videoRef.current.duration, time)
    );
    
    setState(prev => ({ ...prev, isSeeking: true }));
    
    videoRef.current.currentTime = clampedTime;
    lastTimeRef.current = clampedTime;
    
    // Sync all registered videos immediately
    syncedVideosRef.current.forEach(video => {
      video.currentTime = clampedTime;
    });
    
    setState(prev => ({ 
      ...prev, 
      currentTime: clampedTime, 
      isSeeking: false 
    }));
    
    onTimeUpdate?.(clampedTime);
  }, [clipStartTime, clipEndTime, onTimeUpdate]);

  // Seek relative to current position
  const seekRelative = useCallback((delta: number) => {
    seek(state.currentTime + delta);
  }, [state.currentTime, seek]);

  // Step forward one frame
  const stepForward = useCallback(() => {
    pause();
    seek(state.currentTime + frameTime);
  }, [state.currentTime, frameTime, pause, seek]);

  // Step backward one frame
  const stepBackward = useCallback(() => {
    pause();
    seek(state.currentTime - frameTime);
  }, [state.currentTime, frameTime, pause, seek]);

  // Seek to specific frame
  const seekToFrame = useCallback((frame: number, customFps?: number) => {
    const time = getTimeForFrame(frame, customFps);
    seek(time);
  }, [getTimeForFrame, seek]);

  // Set playback rate
  const setPlaybackRate = useCallback((rate: number) => {
    if (!videoRef.current) return;
    
    videoRef.current.playbackRate = rate;
    syncedVideosRef.current.forEach(video => {
      video.playbackRate = rate;
    });
    
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, []);

  // Register a video to be synced with the master
  const syncVideo = useCallback((video: HTMLVideoElement) => {
    syncedVideosRef.current.add(video);
    
    // Initial sync
    if (videoRef.current) {
      video.currentTime = videoRef.current.currentTime;
      video.playbackRate = state.playbackRate;
      if (state.isPlaying) {
        video.play().catch(() => {});
      }
    }
    
    // Return cleanup function
    return () => {
      syncedVideosRef.current.delete(video);
    };
  }, [state.isPlaying, state.playbackRate]);

  // Setup main video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setState(prev => ({
        ...prev,
        duration: video.duration,
        isLoaded: true,
      }));
      
      // Set initial time
      if (initialTime > 0) {
        video.currentTime = initialTime;
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setState(prev => ({ ...prev, buffered: bufferedEnd }));
      }
    };

    const handleSeeking = () => {
      setState(prev => ({ ...prev, isSeeking: true }));
    };

    const handleSeeked = () => {
      setState(prev => ({ ...prev, isSeeking: false }));
      
      // Ensure all synced videos are at the same position
      const currentTime = video.currentTime;
      syncedVideosRef.current.forEach(v => {
        if (Math.abs(v.currentTime - currentTime) > SYNC_THRESHOLD) {
          v.currentTime = currentTime;
        }
      });
    };

    const handleEnded = () => {
      // Loop back to clip start if we have a clip range
      if (clipStartTime > 0) {
        video.currentTime = clipStartTime;
      }
      setState(prev => ({ ...prev, isPlaying: false }));
      onEnded?.();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ended', handleEnded);
    };
  }, [initialTime, clipStartTime, onEnded]);

  return {
    state,
    videoRef,
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    setPlaybackRate,
    stepForward,
    stepBackward,
    seekToFrame,
    syncVideo,
    getTimeForFrame,
    getFrameForTime,
  };
}

export default useVideoSync;
