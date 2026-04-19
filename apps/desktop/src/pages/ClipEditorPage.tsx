import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { mediaUrl } from '@/lib/config';
import { useProject, useSegmentStats, useSegmentTags } from '@/lib/queries';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Layers,
  Type,
  Save,
  Music,
  Scissors,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';

import { useLayoutEditorStore, useSubtitleStyleStore, useToastStore, useIntroStore, useMusicStore, useSegmentFilterStore, useJumpCutStore } from '@/store';
import { api } from '@/lib/api';
import { ExportModal } from '@/components/export/ExportModal';
import { TemplateStudio } from '@/components/editor/TemplateStudio';
import { SubtitlePanel } from '@/pages/clip-editor/SubtitlePanel';
import { IntroPanel } from '@/pages/clip-editor/IntroPanel';
import { MusicPanel } from '@/pages/clip-editor/MusicPanel';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Timeline } from '@/components/editor/Timeline';
import { type TimelineTrack } from '@/components/editor/MultiTrackTimeline';
import { type AudioTrack } from '@/components/editor/AudioMixer';
import { Canvas9x16 } from '@/components/editor/Canvas9x16';
import { SourcePreview } from '@/components/editor/SourcePreview';
import { WordTiming } from '@/components/editor/KaraokeSubtitles';
import { SegmentFilterBar, type FilterState, type SegmentStats } from '@/components/segments/SegmentFilterBar';

interface Project {
  id: string;
  name: string;
  duration?: number;
}

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcript?: string;
  topicLabel?: string;
  hookText?: string;
  score?: { total: number };
}

export default function ClipEditorPage() {
  useKeyboardShortcuts();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  useRef<HTMLDivElement>(null); // canvasContainerRef

  // React Query — project, stats, tags (cached + auto-refresh)
  const { data: projectResponse, isLoading: projectLoading } = useProject(projectId);
  const project = (projectResponse?.data ?? null) as Project | null;

  const { data: statsData } = useSegmentStats(projectId ?? '');
  const segmentStats = (statsData?.data ?? null) as SegmentStats | null;

  const { data: tagsData } = useSegmentTags(projectId ?? '');
  const availableTags = (tagsData?.data?.tags ?? []) as string[];

  // State
  const [timeline, setTimeline] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [loading, setLoading] = useState(true);

  // Segment filter state from persisted store
  const {
    minScore, minDuration, maxDuration, limit,
    sortBy, search, selectedTags,
    setFilters: setStoreFilters,
    setSearch,
    setSelectedTags,
  } = useSegmentFilterStore();

  const [, setTotalFiltered] = useState(0);

  const filters: FilterState = { minScore, minDuration, maxDuration, limit, search, tags: selectedTags };
  
  const setFilters = (newFilters: FilterState) => {
    setStoreFilters(newFilters);
  };

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Stores
  const { zones, selectedZoneId, presetName, updateZone, setSelectedZone, applyPreset } = useLayoutEditorStore();
  const { style: subtitleStyle, presetName: subtitlePreset, setStyle: setSubtitleStyle, applyPreset: applySubtitlePreset } = useSubtitleStyleStore();
  const { config: introConfig, setConfig: setIntroConfig, applyPreset: applyIntroPreset } = useIntroStore();
  const { config: jumpCutConfig } = useJumpCutStore();

  // Active panel
  const [activePanel, setActivePanel] = useState<'layout' | 'subtitles' | 'intro' | 'music' | 'jumpcuts' | 'templates' | 'audio'>('layout');
  
  // Advanced timeline mode
  const [, /* useAdvancedTimeline */] = useState(false);
  
  // Multi-track timeline state
  useState<TimelineTrack[]>([]); // timelineTracks
  
  // Audio mixer state
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([
    { id: 'main', name: 'Main Audio', type: 'main', volume: 100, muted: false, solo: false, pan: 0, startTime: 0, duration: 0, fadeIn: 0, fadeOut: 0 },
    { id: 'music', name: 'Music', type: 'music', volume: 30, muted: false, solo: false, pan: 0, startTime: 0, duration: 0, fadeIn: 0, fadeOut: 0 },
  ]);
  
  // Music state from store
  const { selectedMusic, musicList, setSelectedMusic, setMusicList } = useMusicStore();
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Canvas dimensions (9:16 ratio)
  const CANVAS_WIDTH = 360;
  const CANVAS_HEIGHT = 640;

  // Derived data
  const clipDuration = trimEnd - trimStart || (selectedSegment?.duration || 0);
  const audioLayer = timeline?.layers?.find((l: any) => l.type === 'audio_energy');
  // Normalize waveform data to number[]
  const waveformData = audioLayer?.data?.map((d: any) => typeof d === 'number' ? d : d.value) || [];
  const faceDetections = timeline?.faceDetections || [];
  
  // Extract word timings from timeline transcript layer
  const transcriptLayer = timeline?.layers?.find((l: any) => l.type === 'transcript');
  const wordTimings: WordTiming[] = transcriptLayer?.words || [];
  
  // Video source info
  const videoSize = timeline?.faceDetections?.[0]?.video_size || { width: 1920, height: 1080 };

  const handleExport = async (options: any) => {
    if (!selectedSegment || !project) return;
    try {
      // Build layoutConfig from editor zones
      const facecamZone = zones.find(z => z.type === 'facecam');
      const contentZone = zones.find(z => z.type === 'content');
      
      const layoutConfig = {
        facecam: facecamZone ? {
          x: facecamZone.x,
          y: facecamZone.y,
          width: facecamZone.width,
          height: facecamZone.height,
          sourceCrop: facecamZone.sourceCrop,
        } : undefined,
        content: contentZone ? {
          x: contentZone.x,
          y: contentZone.y,
          width: contentZone.width,
          height: contentZone.height,
          sourceCrop: contentZone.sourceCrop,
        } : undefined,
        facecamRatio: facecamZone ? facecamZone.height / 100 : 0.4,
      };
      
      const response = await api.exportSegment(project.id, {
        segmentId: selectedSegment.id,
        variant: 'A',
        platform: 'tiktok',
        includeCaptions: options.includeSubtitles,
        burnSubtitles: options.burnSubtitles,
        includeCover: options.exportCover,
        includeMetadata: options.exportMetadata,
        includePost: false,
        useNvenc: true,
        captionStyle: options.captionStyle,
        layoutConfig,
        introConfig: introConfig.enabled ? introConfig : undefined,
        jumpCutConfig: jumpCutConfig.enabled ? jumpCutConfig : undefined,
        languages: Array.isArray(options.languages) ? options.languages : [],
      });
      
      if (response.data?.jobId) {
        addToast({
          type: 'success',
          title: 'Export lancé 🚀',
          message: 'Votre clip a été ajouté à la file d\'attente'
        });
        setShowExportModal(false);
      }
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de lancer l\'export'
      });
    }
  };

  // Load timeline on mount (project/stats/tags handled by React Query hooks above)
  useEffect(() => {
    async function loadTimeline() {
      if (!projectId) return;
      try {
        const timelineRes = await api.getTimeline(projectId);
        setTimeline(timelineRes.data);
      } catch (err) {
        console.error('Failed to load timeline:', err);
      }
    }
    loadTimeline();
  }, [projectId]);

  // Load segments when filters change
  useEffect(() => {
    async function loadSegments() {
      if (!projectId) return;
      setLoading(true);
      try {
        const pageSize = limit || 100;
        const segmentsRes = await api.getSegments(projectId, {
          pageSize: Math.min(pageSize, 500),
          sortBy: sortBy === 'time' ? 'startTime' : sortBy,
          sortOrder: 'desc',
          minScore: minScore > 0 ? minScore : undefined,
          minDuration: minDuration > 0 ? minDuration : undefined,
          maxDuration: maxDuration < 600 ? maxDuration : undefined,
        });
        
        const segs = segmentsRes.data?.items || [];
        setSegments(segs);
        setTotalFiltered(segmentsRes.data?.total || 0);

        // Select segment from URL or first one (only on initial load)
        if (!selectedSegment && segs.length > 0) {
          const segmentId = searchParams.get('segment');
          const seg = segmentId ? segs.find((s: Segment) => s.id === segmentId) : segs[0];
          if (seg) {
            setSelectedSegment(seg);
            setTrimStart(seg.startTime);
            setTrimEnd(seg.endTime);
          }
        }
      } catch (err) {
        console.error('Failed to load segments:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSegments();
  }, [projectId, minScore, minDuration, maxDuration, limit, sortBy, search, selectedTags, searchParams]);

  // Sync video time with selected segment
  useEffect(() => {
    if (selectedSegment) {
      setCurrentTime(trimStart);
    }
  }, [selectedSegment, trimStart]);

  // Playback controls - Canvas9x16 manages actual playback via isPlaying state
  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    const clampedTime = Math.max(trimStart, Math.min(trimEnd || 9999, time));
    setCurrentTime(clampedTime);
  }, [trimStart, trimEnd]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          handleSeek(currentTime - (e.shiftKey ? 5 : 1));
          break;
        case 'ArrowRight':
          handleSeek(currentTime + (e.shiftKey ? 5 : 1));
          break;
        case 'm':
          setIsMuted((m) => !m);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentTime, handlePlayPause, handleSeek]);

  if (projectLoading || (loading && segments.length === 0)) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--bg-primary)]">
        <p className="text-[var(--text-muted)]">Projet non trouvé</p>
        <button className="mt-4 btn" onClick={() => navigate('/')}>Retour</button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-[#111] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => navigate(`/project/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold">{project.name}</h1>
            <p className="text-xs text-gray-400">
              {selectedSegment?.topicLabel || 'Éditeur de clip'} • {formatDuration(clipDuration)}
            </p>
          </div>
        </div>

        {/* Segment selector */}
        <div className="flex items-center gap-4">
          <select
            value={selectedSegment?.id || ''}
            onChange={(e) => {
              const seg = segments.find((s) => s.id === e.target.value);
              if (seg) {
                setSelectedSegment(seg);
                setTrimStart(seg.startTime);
                setTrimEnd(seg.endTime);
              }
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
          >
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.topicLabel || 'Segment'} ({formatDuration(seg.duration)}) - Score: {seg.score?.total || 0}
              </option>
            ))}
          </select>

          <button
            className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-medium flex items-center gap-2 transition-colors"
            onClick={() => setShowExportModal(true)}
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Mini segment list with filters */}
        <div className="w-56 border-r border-white/10 bg-[#0d0d0d] flex flex-col">
          <div className="p-2 border-b border-white/10">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Segments</h3>
          </div>
          
          {/* Compact Filter Bar */}
          <SegmentFilterBar
            stats={segmentStats}
            filters={filters}
            onFiltersChange={setFilters}
            filteredCount={segments.length}
            loading={loading}
            availableTags={availableTags}
            onSearchChange={setSearch}
            onTagsChange={setSelectedTags}
          />
          
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : segments.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                Aucun segment
              </div>
            ) : (
              segments.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => {
                    setSelectedSegment(seg);
                    setTrimStart(seg.startTime);
                    setTrimEnd(seg.endTime);
                  }}
                  className={`w-full p-2 rounded-lg text-left text-xs transition-colors ${
                    selectedSegment?.id === seg.id
                      ? 'bg-blue-500/20 border border-blue-500'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                      (seg.score?.total || 0) >= 60 ? 'bg-green-500' : 'bg-gray-600'
                    }`}>
                      {seg.score?.total || 0}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{seg.topicLabel || 'Segment'}</div>
                      <div className="text-gray-500">{formatDuration(seg.duration)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* CENTER: Source + Canvas Preview */}
        <div className="flex-1 flex flex-col bg-[#080808]">
          {/* Canvas area with source and output */}
          <div className="flex-1 flex gap-4 p-4">
            {/* Source Preview (16:9) */}
            <div className="flex-1 flex flex-col bg-[#111] rounded-xl overflow-hidden border border-white/10">
              <SourcePreview
                videoSrc={mediaUrl(projectId!, 'proxy')}
                currentTime={currentTime}
                isPlaying={isPlaying}
                videoSize={videoSize}
              />
            </div>
            
            {/* Output Preview (9:16) */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-xs text-gray-500 font-mono mb-2">
                9:16 • 1080×1920
              </div>
              <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
                <Canvas9x16
                  videoSrc={mediaUrl(projectId!, 'proxy')}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  currentSubtitle={selectedSegment?.transcript || ''}
                  faceDetections={faceDetections}
                  wordTimings={wordTimings.filter(w => w.start >= trimStart && w.end <= trimEnd).map(w => ({
                    ...w,
                    start: w.start - trimStart,
                    end: w.end - trimStart,
                  }))}
                  clipStartTime={trimStart}
                  clipDuration={clipDuration}
                  onTimeUpdate={(time) => {
                    setCurrentTime(time);
                    if (time >= trimEnd) {
                      setCurrentTime(trimStart);
                    }
                  }}
                  onPlayPause={() => setIsPlaying(!isPlaying)}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="h-32 border-t border-white/10 bg-[#0d0d0d] p-4">
            {/* Transport controls */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                onClick={() => handleSeek(trimStart)}
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                className="p-3 rounded-full bg-white text-black hover:bg-gray-200 transition-colors"
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>
              <button
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                onClick={() => handleSeek(trimEnd)}
              >
                <SkipForward className="w-5 h-5" />
              </button>
              <button
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <span className="text-sm font-mono text-gray-400 ml-4">
                {formatTime(currentTime - trimStart)} / {formatTime(clipDuration)}
              </span>
            </div>

            {/* Timeline */}
            <Timeline
              duration={clipDuration}
              waveformData={waveformData}
              onSeek={handleSeek}
            />
          </div>
        </div>

        {/* RIGHT: Layout & Subtitle controls */}
        <div className="w-80 border-l border-white/10 bg-[#0d0d0d] flex flex-col">
          {/* Tabs - Icon only with tooltip */}
          <div className="flex border-b border-white/10 px-2">
            {[
              { id: 'layout', icon: Layers, label: 'Layout' },
              { id: 'subtitles', icon: Type, label: 'Sous-titres' },
              { id: 'intro', icon: Play, label: 'Intro' },
              { id: 'music', icon: Music, label: 'Musique' },
              { id: 'audio', icon: SlidersHorizontal, label: 'Audio Mix' },
              { id: 'jumpcuts', icon: Zap, label: 'Jump Cuts' },
              { id: 'templates', icon: Save, label: 'Templates' },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 border-b-2 transition-all group relative ${
                    isActive 
                      ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                  onClick={() => setActivePanel(tab.id as typeof activePanel)}
                  title={tab.label}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'scale-110' : ''} transition-transform`} />
                  <span className={`text-[9px] font-medium uppercase tracking-wider ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                    {tab.id === 'subtitles' ? 'Subs' : tab.id === 'templates' ? 'Tmpl' : tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto p-4">
            {activePanel === 'layout' && (
              <LayoutPanel
                zones={zones}
                selectedZoneId={selectedZoneId}
                presetName={presetName}
                onZoneSelect={setSelectedZone}
                onZoneUpdate={updateZone}
                onApplyPreset={applyPreset}
              />
            )}
            {activePanel === 'subtitles' && (
              <SubtitlePanel
                style={subtitleStyle}
                presetName={subtitlePreset}
                onStyleChange={setSubtitleStyle}
                onApplyPreset={applySubtitlePreset}
                wordTimings={wordTimings}
                transcript={selectedSegment?.transcript || ''}
                projectId={projectId || ''}
                segmentId={selectedSegment?.id || ''}
              />
            )}
            {activePanel === 'intro' && (
              <IntroPanel
                config={introConfig}
                segmentTitle={selectedSegment?.topicLabel || ''}
                onConfigChange={setIntroConfig}
                onApplyPreset={applyIntroPreset}
              />
            )}
            {activePanel === 'music' && (
              <MusicPanel
                selectedMusic={selectedMusic}
                musicList={musicList}
                onMusicSelect={setSelectedMusic}
                onMusicListUpdate={setMusicList}
                videoRef={videoRef}
                musicRef={musicRef}
              />
            )}
            {activePanel === 'audio' && (
              <AudioMixerPanel 
                audioTracks={audioTracks}
                onTracksChange={setAudioTracks}
              />
            )}
            {activePanel === 'jumpcuts' && (
              <JumpCutPanel
                projectId={projectId || ''}
                segmentId={selectedSegment?.id || ''}
                segmentDuration={selectedSegment?.duration || 0}
              />
            )}
            {activePanel === 'templates' && (
              <TemplateStudio />
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        segmentName={selectedSegment?.topicLabel || 'Segment'}
        duration={clipDuration}
        onExport={handleExport}
      />
    </div>
  );
}

// Layout panel
function LayoutPanel({
  zones,
  selectedZoneId,
  presetName,
  onZoneSelect,
  onZoneUpdate,
  onApplyPreset,
}: {
  zones: any[];
  selectedZoneId: string | null;
  presetName: string;
  onZoneSelect: (id: string | null) => void;
  onZoneUpdate: (id: string, updates: any) => void;
  onApplyPreset: (preset: string) => void;
}) {
  const presets = [
    { id: 'facecam-top', label: 'Facecam en haut', icon: '🎥' },
    { id: 'facecam-bottom', label: 'Facecam en bas', icon: '🎬' },
    { id: 'split-50-50', label: '50/50', icon: '⬛' },
    { id: 'pip-corner', label: 'PIP coin', icon: '📺' },
    { id: 'content-only', label: 'Contenu seul', icon: '🖼' },
  ];

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-3">Presets</h4>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              className={`p-3 rounded-lg text-left transition-colors ${
                presetName === preset.id
                  ? 'bg-blue-500/20 border border-blue-500'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              <span className="text-xl mb-1 block">{preset.icon}</span>
              <span className="text-xs">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zones list */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-3">Zones</h4>
        <div className="space-y-2">
          {zones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => onZoneSelect(zone.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedZoneId === zone.id
                  ? 'bg-white/10 border border-white/20'
                  : 'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${zone.type === 'facecam' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                <span className="font-medium capitalize">{zone.type}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {Math.round(zone.x)}%, {Math.round(zone.y)}% • {Math.round(zone.width)}×{Math.round(zone.height)}%
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected zone controls */}
      {selectedZone && (
        <div className="space-y-4">
          {/* Target position (9:16 canvas) */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">
              Position cible (9:16)
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">X (%)</label>
                <input
                  type="number"
                  value={Math.round(selectedZone.x)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { x: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Y (%)</label>
                <input
                  type="number"
                  value={Math.round(selectedZone.y)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { y: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Largeur (%)</label>
                <input
                  type="number"
                  value={Math.round(selectedZone.width)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { width: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Hauteur (%)</label>
                <input
                  type="number"
                  value={Math.round(selectedZone.height)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { height: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Source crop (16:9 source) */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              Crop source (16:9)
              <span className="text-xs text-blue-400 font-normal">(Glisse sur la vidéo gauche)</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">X (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={(selectedZone.sourceCrop?.x ?? 0).toFixed(2)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { 
                    sourceCrop: { 
                      ...selectedZone.sourceCrop || { x: 0, y: 0, width: 1, height: 1 },
                      x: Math.max(0, Math.min(1, Number(e.target.value)))
                    }
                  })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Y (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={(selectedZone.sourceCrop?.y ?? 0).toFixed(2)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { 
                    sourceCrop: { 
                      ...selectedZone.sourceCrop || { x: 0, y: 0, width: 1, height: 1 },
                      y: Math.max(0, Math.min(1, Number(e.target.value)))
                    }
                  })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Largeur (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="1"
                  value={(selectedZone.sourceCrop?.width ?? 1).toFixed(2)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { 
                    sourceCrop: { 
                      ...selectedZone.sourceCrop || { x: 0, y: 0, width: 1, height: 1 },
                      width: Math.max(0.1, Math.min(1, Number(e.target.value)))
                    }
                  })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Hauteur (0-1)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="1"
                  value={(selectedZone.sourceCrop?.height ?? 1).toFixed(2)}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { 
                    sourceCrop: { 
                      ...selectedZone.sourceCrop || { x: 0, y: 0, width: 1, height: 1 },
                      height: Math.max(0.1, Math.min(1, Number(e.target.value)))
                    }
                  })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
            
            {/* Auto-track toggle for facecam */}
            {selectedZone.type === 'facecam' && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedZone.autoTrack ?? false}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { autoTrack: e.target.checked })}
                  className="w-4 h-4 rounded bg-white/10 border-white/20"
                />
                <span className="text-xs text-gray-400">Auto-tracking (suit le visage)</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-white/5 rounded-lg p-3 text-xs text-gray-400">
        <p className="font-medium text-white mb-1">💡 Astuce</p>
        <p>Glisse les zones sur le canvas pour les repositionner. Utilise les coins pour redimensionner.</p>
      </div>
    </div>
  );
}

// Jump Cut Panel
function JumpCutPanel({
  projectId,
  segmentId,
  segmentDuration: _segmentDuration,
}: {
  projectId: string;
  segmentId: string;
  segmentDuration: number;
}) {
  const {
    config,
    analysis,
    analyzing,
    setEnabled,
    setSensitivity,
    setTransition,
    setAnalysis,
    setAnalyzing 
  } = useJumpCutStore();
  const { addToast } = useToastStore();

  const handleAnalyze = async () => {
    if (!projectId || !segmentId) {
      addToast({ type: 'error', title: 'Erreur', message: 'Sélectionne un segment d\'abord' });
      return;
    }

    setAnalyzing(true);
    try {
      const result = await api.analyzeJumpCuts(projectId, segmentId, {
        sensitivity: config.sensitivity,
      });
      
      if (result.data) {
        setAnalysis(result.data);
        addToast({ 
          type: 'success', 
          title: 'Analyse terminée', 
          message: `${result.data.cuts_count} cuts détectés (-${result.data.time_saved_percent.toFixed(0)}%)`
        });
      }
    } catch (err) {
      console.error('Jump cut analysis failed:', err);
      addToast({ type: 'error', title: 'Erreur', message: 'L\'analyse a échoué' });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Jump Cuts
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Supprime les silences automatiquement</p>
        </div>
        <button
          onClick={() => setEnabled(!config.enabled)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            config.enabled ? 'bg-yellow-500' : 'bg-gray-600'
          }`}
        >
          <div 
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              config.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Sensitivity */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <label className="text-sm font-medium text-white block mb-3">Sensibilité</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'light', label: 'Léger', desc: '600ms+', color: 'green' },
            { id: 'normal', label: 'Normal', desc: '400ms+', color: 'yellow' },
            { id: 'aggressive', label: 'Agressif', desc: '250ms+', color: 'red' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSensitivity(opt.id)}
              className={`p-2 rounded-lg text-center transition-all ${
                config.sensitivity === opt.id
                  ? opt.color === 'green' ? 'bg-green-500/20 border-2 border-green-500/50 text-green-400'
                  : opt.color === 'yellow' ? 'bg-yellow-500/20 border-2 border-yellow-500/50 text-yellow-400'
                  : 'bg-red-500/20 border-2 border-red-500/50 text-red-400'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span className="text-xs font-medium block">{opt.label}</span>
              <span className="text-[10px] opacity-60">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Transition style */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <label className="text-sm font-medium text-white block mb-3">Style de transition</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'hard', label: 'Hard Cut', icon: '✂️' },
            { id: 'zoom', label: 'Zoom', icon: '🔍' },
            { id: 'crossfade', label: 'Fondu', icon: '🌊' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTransition(opt.id)}
              className={`p-2.5 rounded-lg text-center transition-all ${
                config.transition === opt.id
                  ? 'bg-blue-500/20 border-2 border-blue-500/50 text-blue-400'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span className="text-lg block mb-0.5">{opt.icon}</span>
              <span className="text-[10px] font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={analyzing || !segmentId}
        className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
          analyzing
            ? 'bg-yellow-500/20 text-yellow-400 cursor-wait'
            : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white'
        }`}
      >
        {analyzing ? (
          <>
            <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
            Analyse en cours...
          </>
        ) : (
          <>
            <Scissors className="w-4 h-4" />
            Analyser les silences
          </>
        )}
      </button>

      {/* Analysis results */}
      {analysis && (
        <div className="p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl border border-yellow-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-white">Résultats</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <span className="text-lg font-bold text-yellow-400">{analysis.cuts_count}</span>
              <span className="text-[10px] text-gray-400 block">cuts détectés</span>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <span className="text-lg font-bold text-green-400">-{analysis.time_saved_percent.toFixed(0)}%</span>
              <span className="text-[10px] text-gray-400 block">temps économisé</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {formatTime(analysis.original_duration)} → {formatTime(analysis.new_duration)}
            </span>
            <span className="text-yellow-400 font-medium">
              -{analysis.time_saved.toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <p className="text-[10px] text-blue-400/80">
          <strong>💡 Jump Cuts</strong> : Détecte et supprime automatiquement les pauses et silences 
          pour un contenu plus dynamique. Style viral à la MrBeast !
        </p>
      </div>
    </div>
  );
}

// Audio Mixer Panel Component
function AudioMixerPanel({ 
  audioTracks, 
  onTracksChange 
}: { 
  audioTracks: AudioTrack[];
  onTracksChange: (tracks: AudioTrack[]) => void;
}) {
  const handleVolumeChange = (trackId: string, volume: number) => {
    onTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, volume } : t)
    );
  };

  const handleMuteToggle = (trackId: string) => {
    onTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t)
    );
  };

  const handleSoloToggle = (trackId: string) => {
    onTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t)
    );
  };

  const handlePanChange = (trackId: string, pan: number) => {
    onTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, pan } : t)
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white mb-4">Audio Mixer</h3>
      
      {audioTracks.map(track => (
        <div key={track.id} className="bg-white/5 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{track.name}</span>
            <div className="flex gap-1">
              <button
                onClick={() => handleMuteToggle(track.id)}
                className={`px-2 py-1 text-xs rounded ${
                  track.muted ? 'bg-red-500/30 text-red-400' : 'bg-white/10 text-gray-400'
                }`}
              >
                M
              </button>
              <button
                onClick={() => handleSoloToggle(track.id)}
                className={`px-2 py-1 text-xs rounded ${
                  track.solo ? 'bg-yellow-500/30 text-yellow-400' : 'bg-white/10 text-gray-400'
                }`}
              >
                S
              </button>
            </div>
          </div>
          
          {/* Volume slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Volume</span>
              <span>{track.volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={track.volume}
              onChange={e => handleVolumeChange(track.id, parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>
          
          {/* Pan slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Pan</span>
              <span>{track.pan > 0 ? `R${track.pan}` : track.pan < 0 ? `L${Math.abs(track.pan)}` : 'C'}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={track.pan}
              onChange={e => handlePanChange(track.id, parseInt(e.target.value))}
              className="w-full accent-purple-500"
            />
          </div>
        </div>
      ))}
      
      <div className="pt-4 border-t border-white/10">
        <p className="text-xs text-gray-500">
          Ajustez le volume et le panoramique de chaque piste audio.
          M = Mute, S = Solo
        </p>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
