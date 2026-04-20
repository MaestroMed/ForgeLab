import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';

// Clip Editor store
interface ClipEditorState {
  selectedSegmentId: string | null;
  playbackTime: number;
  isPlaying: boolean;
  trimStart: number;
  trimEnd: number;
  zoom: number;

  setSelectedSegment: (id: string | null) => void;
  setPlaybackTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTrimRange: (start: number, end: number) => void;
  setZoom: (zoom: number) => void;
}

export const useClipEditorStore = create<ClipEditorState>((set) => ({
  selectedSegmentId: null,
  playbackTime: 0,
  isPlaying: false,
  trimStart: 0,
  trimEnd: 0,
  zoom: 1,

  setSelectedSegment: (id) => set({ selectedSegmentId: id }),
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setTrimRange: (start, end) => set({ trimStart: start, trimEnd: end }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(4, zoom)) }),
}));

// Layout Editor store
export interface SourceCrop {
  x: number;      // Normalized 0-1 position in source video
  y: number;
  width: number;
  height: number;
}

export interface LayoutZone {
  id: string;
  type: 'facecam' | 'content' | 'custom';
  x: number;           // Target position in 9:16 canvas (%)
  y: number;
  width: number;
  height: number;
  sourceCrop?: SourceCrop;  // Source crop region in 16:9 video (normalized)
  autoTrack?: boolean;      // Enable auto-reframe for this zone
}

interface LayoutEditorState {
  zones: LayoutZone[];
  selectedZoneId: string | null;
  presetName: string;

  setZones: (zones: LayoutZone[]) => void;
  updateZone: (id: string, updates: Partial<LayoutZone>) => void;
  setSelectedZone: (id: string | null) => void;
  applyPreset: (preset: string) => void;
}

export const LAYOUT_PRESETS: Record<string, LayoutZone[]> = {
  'facecam-top': [
    { id: 'facecam', type: 'facecam', x: 0, y: 0, width: 100, height: 35,
      sourceCrop: { x: 0.7, y: 0, width: 0.3, height: 0.35 }, autoTrack: false },
    { id: 'content', type: 'content', x: 0, y: 35, width: 100, height: 65,
      sourceCrop: { x: 0, y: 0.25, width: 1, height: 0.75 }, autoTrack: false },
  ],
  'facecam-bottom': [
    { id: 'content', type: 'content', x: 0, y: 0, width: 100, height: 65,
      sourceCrop: { x: 0, y: 0, width: 1, height: 0.75 }, autoTrack: false },
    { id: 'facecam', type: 'facecam', x: 0, y: 65, width: 100, height: 35,
      sourceCrop: { x: 0.7, y: 0, width: 0.3, height: 0.35 }, autoTrack: false },
  ],
  'split-50-50': [
    { id: 'facecam', type: 'facecam', x: 0, y: 0, width: 100, height: 50,
      sourceCrop: { x: 0.6, y: 0, width: 0.4, height: 0.5 }, autoTrack: false },
    { id: 'content', type: 'content', x: 0, y: 50, width: 100, height: 50,
      sourceCrop: { x: 0, y: 0.3, width: 1, height: 0.7 }, autoTrack: false },
  ],
  'pip-corner': [
    { id: 'content', type: 'content', x: 0, y: 0, width: 100, height: 100,
      sourceCrop: { x: 0, y: 0, width: 1, height: 1 }, autoTrack: false },
    { id: 'facecam', type: 'facecam', x: 65, y: 5, width: 30, height: 25,
      sourceCrop: { x: 0.7, y: 0, width: 0.3, height: 0.3 }, autoTrack: false },
  ],
  'content-only': [
    { id: 'content', type: 'content', x: 0, y: 0, width: 100, height: 100,
      sourceCrop: { x: 0, y: 0, width: 1, height: 1 }, autoTrack: false },
  ],
};

export const useLayoutEditorStore = create<LayoutEditorState>()(
  persist(
    temporal(
      (set) => ({
        zones: LAYOUT_PRESETS['facecam-top'],
        selectedZoneId: null,
        presetName: 'facecam-top',

        setZones: (zones) => set({ zones }),
        updateZone: (id, updates) => set((state) => ({
          zones: state.zones.map((z) => (z.id === id ? { ...z, ...updates } : z)),
        })),
        setSelectedZone: (id) => set({ selectedZoneId: id }),
        applyPreset: (preset) => set({
          zones: LAYOUT_PRESETS[preset] || LAYOUT_PRESETS['facecam-top'],
          presetName: preset,
        }),
      }),
      {
        limit: 50,
        partialize: (state) => ({ zones: state.zones }),
      }
    ),
    {
      name: 'forge-layout-config',
      partialize: (state) => ({ zones: state.zones, presetName: state.presetName }),
    }
  )
);

// Subtitle Style store
export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  outlineColor: string;
  outlineWidth: number;
  position: 'bottom' | 'center' | 'top';
  positionY?: number;  // Custom Y position (0-1920, overrides position preset)
  animation: 'none' | 'fade' | 'pop' | 'bounce' | 'glow' | 'wave' | 'typewriter';
  highlightColor: string;
  wordsPerLine: number;  // Max words to show at once (karaoke style)
  enabled?: boolean;  // Toggle subtitles on/off
}

interface SubtitleStyleState {
  style: SubtitleStyle;
  presetName: string;
  setStyle: (updates: Partial<SubtitleStyle>) => void;
  applyPreset: (preset: string) => void;
}

// WORLD CLASS STYLE - Un seul style parfait, pas de choix
// Police Anton, MAJUSCULES, jaune/blanc, effet karaoke visible
export const WORLD_CLASS_STYLE: SubtitleStyle = {
  fontFamily: 'Anton',  // Bold condensed font
  fontSize: 96,  // 5% of 1920 - Maximum mobile visibility
  fontWeight: 700,
  color: '#FFFFFF',  // White for non-active words
  backgroundColor: 'transparent',
  outlineColor: '#000000',  // Black outline
  outlineWidth: 8,  // Thick for maximum contrast
  position: 'center',
  positionY: 960,  // True center (1920/2) - customizable
  animation: 'pop',
  highlightColor: '#FFFF00',  // YELLOW for active word
  wordsPerLine: 4,  // Optimal for viral content
  enabled: true,
};

// Bottom-lower style — subtitles in the lower third, less intrusive
export const BOTTOM_CLEAN_STYLE: SubtitleStyle = {
  fontFamily: 'Anton',
  fontSize: 80,           // Slightly smaller
  fontWeight: 700,
  color: '#FFFFFF',
  backgroundColor: 'transparent',
  outlineColor: '#000000',
  outlineWidth: 6,
  position: 'bottom',
  positionY: 1450,        // 75% down (1920 * 0.755)
  animation: 'pop',
  highlightColor: '#FFFF00',
  wordsPerLine: 3,        // Fewer per line since narrower bottom area
  enabled: true,
};

// Minimal style — small, discrete, white with thin outline
export const MINIMAL_STYLE: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSize: 64,
  fontWeight: 700,
  color: '#FFFFFF',
  backgroundColor: 'transparent',
  outlineColor: '#000000',
  outlineWidth: 4,
  position: 'bottom',
  positionY: 1550,        // 80% down
  animation: 'fade',
  highlightColor: '#00D4FF',  // Cyan highlight
  wordsPerLine: 4,
  enabled: true,
};

// Fire gaming style — orange, bigger, more aggressive
export const FIRE_GAMING_STYLE: SubtitleStyle = {
  fontFamily: 'Montserrat',
  fontSize: 92,
  fontWeight: 700,
  color: '#FFFFFF',
  backgroundColor: 'transparent',
  outlineColor: '#000000',
  outlineWidth: 7,
  position: 'center',
  positionY: 1100,        // Slightly below center
  animation: 'pop',
  highlightColor: '#FF6B00',  // Orange highlight
  wordsPerLine: 3,
  enabled: true,
};

export const SUBTITLE_PRESETS: Record<string, SubtitleStyle> = {
  'default': BOTTOM_CLEAN_STYLE,         // New safer default
  'world_class': WORLD_CLASS_STYLE,       // Hormozi mid-center
  'bottom_clean': BOTTOM_CLEAN_STYLE,     // Lower-third classic
  'minimal': MINIMAL_STYLE,               // Small & discrete
  'fire_gaming': FIRE_GAMING_STYLE,       // Orange aggressive
};

export const SUBTITLE_PRESET_LABELS: Record<string, { label: string; desc: string }> = {
  'bottom_clean': { label: 'Bas clean', desc: 'Anton 80pt blanc, bas écran' },
  'world_class': { label: 'Hormozi', desc: 'Anton 96pt jaune, centre écran' },
  'minimal': { label: 'Minimal', desc: 'Inter 64pt, bas écran, cyan' },
  'fire_gaming': { label: 'Fire gaming', desc: 'Montserrat 92pt, orange' },
};

export const useSubtitleStyleStore = create<SubtitleStyleState>()(
  persist(
    (set) => ({
      style: SUBTITLE_PRESETS['viral_pro'],
      presetName: 'viral_pro',
      setStyle: (updates) => set((state) => ({
        style: { ...state.style, ...updates },
      })),
      applyPreset: (preset) => set({
        style: SUBTITLE_PRESETS[preset] || SUBTITLE_PRESETS['default'],
        presetName: preset,
      }),
    }),
    {
      name: 'forge-subtitle-style',
    }
  )
);
