import { useEffect, useRef, useCallback } from 'react';
import { useAmbientAudioStore, useJobsStore, AmbientTrack } from '@/store';

// Track URLs - relative to public folder
const TRACK_URLS: Record<AmbientTrack, string> = {
  westworld: '/audio/ambient/westworld.mp3',
  minimal: '/audio/ambient/minimal.mp3',
  deep: '/audio/ambient/deep.mp3',
  none: '',
};

// Sound effect URLs
export const SFX_URLS = {
  notification: '/audio/sfx/notification.mp3',
  success: '/audio/sfx/success.mp3',
  error: '/audio/sfx/error.mp3',
  swoosh: '/audio/sfx/swoosh.mp3',
};

export default function AmbientAudioProvider() {
  const { enabled, volume, track, fadeOnActivity, sfxEnabled, sfxVolume } = useAmbientAudioStore();
  const { jobs } = useJobsStore();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetVolumeRef = useRef(volume / 100);
  
  // Check if there are active jobs
  const hasActiveJobs = jobs.some((j) => j.status === 'running');
  
  // Calculate effective volume (with fade for activity)
  const effectiveVolume = fadeOnActivity && hasActiveJobs 
    ? (volume / 100) * 0.3  // Reduce to 30% during activity
    : volume / 100;
  
  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.preload = 'auto';
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);
  
  // Handle track changes
  useEffect(() => {
    if (!audioRef.current) return;
    
    const trackUrl = TRACK_URLS[track];
    if (!trackUrl || track === 'none') {
      audioRef.current.pause();
      audioRef.current.src = '';
      return;
    }
    
    // Only change source if it's different
    if (audioRef.current.src !== window.location.origin + trackUrl) {
      const wasPlaying = !audioRef.current.paused;
      audioRef.current.src = trackUrl;
      audioRef.current.load();
      
      if (enabled && wasPlaying) {
        audioRef.current.play().catch(() => {
          // Autoplay may be blocked
        });
      }
    }
  }, [track, enabled]);
  
  // Handle enabled/disabled
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (enabled && track !== 'none') {
      audioRef.current.play().catch(() => {
        // Autoplay may be blocked, will play on next user interaction
      });
    } else {
      audioRef.current.pause();
    }
  }, [enabled, track]);
  
  // Smooth volume transitions
  useEffect(() => {
    if (!audioRef.current) return;
    
    targetVolumeRef.current = effectiveVolume;
    
    // Clear existing fade
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }
    
    // Smooth fade to target volume
    fadeIntervalRef.current = setInterval(() => {
      if (!audioRef.current) return;
      
      const current = audioRef.current.volume;
      const target = targetVolumeRef.current;
      const diff = target - current;
      
      if (Math.abs(diff) < 0.01) {
        audioRef.current.volume = target;
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
      } else {
        // Ease towards target (20% of remaining distance per step)
        audioRef.current.volume = current + diff * 0.2;
      }
    }, 50);
    
    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, [effectiveVolume]);
  
  // This component doesn't render anything visible
  return null;
}

// Utility function to play sound effects
export function playSfx(sfx: keyof typeof SFX_URLS) {
  const state = useAmbientAudioStore.getState();
  if (!state.sfxEnabled) return;
  
  const audio = new Audio(SFX_URLS[sfx]);
  audio.volume = state.sfxVolume / 100;
  audio.play().catch(() => {
    // Ignore errors (autoplay restrictions)
  });
}
