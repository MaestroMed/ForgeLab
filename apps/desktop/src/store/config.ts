import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Platform presets ────────────────────────────────────────────────────────
export type Platform = 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'twitter';

export const PLATFORM_LABELS: Record<Platform, { label: string; icon: string; maxDuration: number }> = {
  tiktok:           { label: 'TikTok',           icon: '🎵', maxDuration: 60  },
  youtube_shorts:   { label: 'YouTube Shorts',   icon: '▶️', maxDuration: 60  },
  instagram_reels:  { label: 'Instagram Reels',  icon: '📸', maxDuration: 90  },
  twitter:          { label: 'Twitter/X',         icon: '🐦', maxDuration: 140 },
};
// ────────────────────────────────────────────────────────────────────────────

// Intro configuration store
export interface IntroConfig {
  enabled: boolean;
  duration: number; // seconds (1-5)
  title: string;
  badgeText: string; // e.g. "@etostark"
  backgroundBlur: number; // 0-30
  titleFont: string;
  titleSize: number;
  titleColor: string;
  badgeColor: string;
  animation: 'fade' | 'slide' | 'zoom' | 'bounce' | 'swoosh';
}

interface IntroState {
  config: IntroConfig;
  setConfig: (config: Partial<IntroConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  resetConfig: () => void;
  applyPreset: (presetName: string) => void;
}

const DEFAULT_INTRO_CONFIG: IntroConfig = {
  enabled: false,
  duration: 2,
  title: '',
  badgeText: '',
  backgroundBlur: 15,
  titleFont: 'Montserrat',
  titleSize: 72,
  titleColor: '#FFFFFF',
  badgeColor: '#00FF88',
  animation: 'fade',
};

export const INTRO_PRESETS: Record<string, Partial<IntroConfig>> = {
  minimal: {
    backgroundBlur: 20,
    titleFont: 'Inter',
    titleSize: 64,
    titleColor: '#FFFFFF',
    badgeColor: '#888888',
    animation: 'fade',
    duration: 2,
  },
  neon: {
    backgroundBlur: 15,
    titleFont: 'Space Grotesk',
    titleSize: 72,
    titleColor: '#00FFFF',
    badgeColor: '#FF00FF',
    animation: 'swoosh',
    duration: 2.5,
  },
  gaming: {
    backgroundBlur: 10,
    titleFont: 'Montserrat',
    titleSize: 80,
    titleColor: '#00FF88',
    badgeColor: '#FF0080',
    animation: 'zoom',
    duration: 2,
  },
  elegant: {
    backgroundBlur: 25,
    titleFont: 'Playfair Display',
    titleSize: 60,
    titleColor: '#FFD700',
    badgeColor: '#FFFFFF',
    animation: 'swoosh',
    duration: 3,
  },
};

export const useIntroStore = create<IntroState>()(
  persist(
    (set) => ({
      config: DEFAULT_INTRO_CONFIG,

      setConfig: (updates) => set((state) => ({
        config: { ...state.config, ...updates },
      })),

      setEnabled: (enabled) => set((state) => ({
        config: { ...state.config, enabled },
      })),

      resetConfig: () => set({ config: DEFAULT_INTRO_CONFIG }),

      applyPreset: (presetName) => set((state) => {
        const preset = INTRO_PRESETS[presetName];
        if (preset) {
          return { config: { ...state.config, ...preset, enabled: true } };
        }
        return state;
      }),
    }),
    {
      name: 'forge-intro-config',
    }
  )
);

// Music store for export
interface MusicState {
  selectedMusic: string | null;
  musicList: string[];
  volume: number;
  startOffset: number;
  setSelectedMusic: (path: string | null) => void;
  setMusicList: (list: string[]) => void;
  addMusic: (path: string) => void;
  removeMusic: (path: string) => void;
  setVolume: (volume: number) => void;
  setStartOffset: (offset: number) => void;
  clearMusic: () => void;
}

export const useMusicStore = create<MusicState>((set) => ({
  selectedMusic: null,
  musicList: [],
  volume: 0.5,
  startOffset: 0,
  setSelectedMusic: (path) => set({ selectedMusic: path }),
  setMusicList: (list) => set({ musicList: list }),
  addMusic: (path) => set((state) => ({
    musicList: [...state.musicList, path],
  })),
  removeMusic: (path) => set((state) => ({
    musicList: state.musicList.filter((m) => m !== path),
    selectedMusic: state.selectedMusic === path ? null : state.selectedMusic,
  })),
  setVolume: (volume) => set({ volume }),
  setStartOffset: (offset) => set({ startOffset: offset }),
  clearMusic: () => set({ selectedMusic: null }),
}));

// Jump Cut Store
export interface JumpCutConfig {
  enabled: boolean;
  sensitivity: 'light' | 'normal' | 'aggressive';
  transition: 'hard' | 'zoom' | 'crossfade';
  min_silence_ms?: number; // Override default based on sensitivity
  padding_ms: number;
}

export interface JumpCutAnalysis {
  original_duration: number;
  new_duration: number;
  cuts_count: number;
  time_saved: number;
  time_saved_percent: number;
  keep_ranges: { start: number; end: number; duration: number }[];
}

interface JumpCutState {
  config: JumpCutConfig;
  analysis: JumpCutAnalysis | null;
  analyzing: boolean;

  setConfig: (updates: Partial<JumpCutConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  setSensitivity: (sensitivity: 'light' | 'normal' | 'aggressive') => void;
  setTransition: (transition: 'hard' | 'zoom' | 'crossfade') => void;
  setAnalysis: (analysis: JumpCutAnalysis | null) => void;
  setAnalyzing: (analyzing: boolean) => void;
  resetConfig: () => void;
}

const DEFAULT_JUMP_CUT_CONFIG: JumpCutConfig = {
  enabled: false,
  sensitivity: 'normal',
  transition: 'hard',
  padding_ms: 50,
};

export const useJumpCutStore = create<JumpCutState>()(
  persist(
    (set) => ({
      config: DEFAULT_JUMP_CUT_CONFIG,
      analysis: null,
      analyzing: false,

      setConfig: (updates) => set((state) => ({
        config: { ...state.config, ...updates },
      })),

      setEnabled: (enabled) => set((state) => ({
        config: { ...state.config, enabled },
      })),

      setSensitivity: (sensitivity) => set((state) => ({
        config: { ...state.config, sensitivity },
      })),

      setTransition: (transition) => set((state) => ({
        config: { ...state.config, transition },
      })),

      setAnalysis: (analysis) => set({ analysis }),

      setAnalyzing: (analyzing) => set({ analyzing }),

      resetConfig: () => set({
        config: DEFAULT_JUMP_CUT_CONFIG,
        analysis: null,
        analyzing: false,
      }),
    }),
    { name: 'forge-jump-cut-config' }
  )
);

// Export Profile store
export interface ExportProfile {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  layout_config: Record<string, any>;
  subtitle_style: Record<string, any>;
  intro_config: Record<string, any>;
  music_config: Record<string, any>;
  export_settings: {
    format: 'mp4' | 'mov';
    resolution: string;
    quality: string;
    use_nvenc: boolean;
    burn_subtitles: boolean;
    include_cover: boolean;
  };
  segment_filters: {
    min_score: number;
    min_duration: number;
    max_duration: number;
    auto_export_count: number;
  };
}

interface ProfileState {
  profiles: ExportProfile[];
  selectedProfileId: string | null;
  loading: boolean;
  setProfiles: (profiles: ExportProfile[]) => void;
  setSelectedProfile: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  addProfile: (profile: ExportProfile) => void;
  updateProfile: (id: string, updates: Partial<ExportProfile>) => void;
  removeProfile: (id: string) => void;
  getDefaultProfile: () => ExportProfile | undefined;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      selectedProfileId: null,
      loading: false,

      setProfiles: (profiles) => set({ profiles }),
      setSelectedProfile: (id) => set({ selectedProfileId: id }),
      setLoading: (loading) => set({ loading }),

      addProfile: (profile) => set((state) => ({
        profiles: [...state.profiles, profile],
      })),

      updateProfile: (id, updates) => set((state) => ({
        profiles: state.profiles.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      })),

      removeProfile: (id) => set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== id),
        selectedProfileId: state.selectedProfileId === id ? null : state.selectedProfileId,
      })),

      getDefaultProfile: () => {
        const { profiles } = get();
        return profiles.find((p) => p.is_default);
      },
    }),
    {
      name: 'forge-profiles',
    }
  )
);

// Ambient Audio store
export type AmbientTrack = 'westworld' | 'minimal' | 'deep' | 'none';

interface AmbientAudioState {
  enabled: boolean;
  volume: number;           // 0-100
  track: AmbientTrack;
  fadeOnActivity: boolean;  // Attenuate during exports
  sfxEnabled: boolean;      // Sound effects for notifications
  sfxVolume: number;

  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setTrack: (track: AmbientTrack) => void;
  setFadeOnActivity: (fade: boolean) => void;
  setSfxEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  toggleEnabled: () => void;
}

export const useAmbientAudioStore = create<AmbientAudioState>()(
  persist(
    (set) => ({
      enabled: false,
      volume: 30,
      track: 'westworld',
      fadeOnActivity: true,
      sfxEnabled: true,
      sfxVolume: 50,
      setEnabled: (enabled) => set({ enabled }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      setTrack: (track) => set({ track }),
      setFadeOnActivity: (fadeOnActivity) => set({ fadeOnActivity }),
      setSfxEnabled: (sfxEnabled) => set({ sfxEnabled }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume: Math.max(0, Math.min(100, sfxVolume)) }),
      toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
    }),
    { name: 'forge-ambient-audio' }
  )
);
