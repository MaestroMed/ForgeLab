import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { mediaUrl } from '@/lib/config';
import { useProject } from '@/lib/queries';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Repeat,
  Rocket,
  Layers,
  Type,
  FileText,
  Music,
  Film,
  SlidersHorizontal,
  Zap,
  Scissors,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Save,
  Check,
} from 'lucide-react';

import {
  useLayoutEditorStore,
  useSubtitleStyleStore,
  useToastStore,
  useIntroStore,
  useMusicStore,
  useJumpCutStore,
} from '@/store';
import { api } from '@/lib/api';
import { ExportModal } from '@/components/export/ExportModal';
import { TemplateStudio } from '@/components/editor/TemplateStudio';
import { SubtitlePanel } from '@/pages/clip-editor/SubtitlePanel';
import { IntroPanel } from '@/pages/clip-editor/IntroPanel';
import { MusicPanel } from '@/pages/clip-editor/MusicPanel';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Canvas9x16 } from '@/components/editor/Canvas9x16';
import { WordTiming } from '@/components/editor/KaraokeSubtitles';
import { type AudioTrack } from '@/components/editor/AudioMixer';

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

type RailTab = 'layout' | 'subtitles' | 'transcript' | 'music' | 'intro' | 'jumpcuts' | 'audio' | 'templates' | 'export';

// ────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────

export default function ClipEditorPage() {
  useKeyboardShortcuts();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Project
  const { data: projectResponse, isLoading: projectLoading } = useProject(projectId);
  const project = (projectResponse?.data ?? null) as Project | null;

  // Data
  const [timeline, setTimeline] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [loading, setLoading] = useState(true);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Stores
  const { zones, selectedZoneId, presetName, updateZone, setSelectedZone, applyPreset } = useLayoutEditorStore();
  const { style: subtitleStyle, presetName: subtitlePreset, setStyle: setSubtitleStyle, applyPreset: applySubtitlePreset } = useSubtitleStyleStore();
  const { config: introConfig, setConfig: setIntroConfig, applyPreset: applyIntroPreset } = useIntroStore();
  const { config: jumpCutConfig } = useJumpCutStore();
  const { selectedMusic, musicList, setSelectedMusic, setMusicList } = useMusicStore();

  // UI state
  const [activeTab, setActiveTab] = useState<RailTab>('layout');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([
    { id: 'main', name: 'Main Audio', type: 'main', volume: 100, muted: false, solo: false, pan: 0, startTime: 0, duration: 0, fadeIn: 0, fadeOut: 0 },
    { id: 'music', name: 'Music', type: 'music', volume: 30, muted: false, solo: false, pan: 0, startTime: 0, duration: 0, fadeIn: 0, fadeOut: 0 },
  ]);

  // Derived
  const clipDuration = trimEnd - trimStart || (selectedSegment?.duration || 0);
  const audioLayer = timeline?.layers?.find((l: any) => l.type === 'audio_energy');
  const waveformData = audioLayer?.data?.map((d: any) => typeof d === 'number' ? d : d.value) || [];
  const faceDetections = timeline?.faceDetections || [];
  const transcriptLayer = timeline?.layers?.find((l: any) => l.type === 'transcript');
  const wordTimings: WordTiming[] = transcriptLayer?.words || [];
  const scopedWordTimings = useMemo(() =>
    wordTimings
      .filter(w => w.start >= trimStart && w.end <= trimEnd)
      .map(w => ({ ...w, start: w.start - trimStart, end: w.end - trimStart })),
    [wordTimings, trimStart, trimEnd]
  );
  const relativeTime = Math.max(0, currentTime - trimStart);

  // Effects — load timeline
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

  // Effects — load segments
  useEffect(() => {
    async function loadSegments() {
      if (!projectId) return;
      setLoading(true);
      try {
        const segmentsRes = await api.getSegments(projectId, {
          pageSize: 500,
          sortBy: 'score',
          sortOrder: 'desc',
        });
        const segs = segmentsRes.data?.items || [];
        setSegments(segs);

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
  }, [projectId, searchParams]);

  // Sync current time with segment changes
  useEffect(() => {
    if (selectedSegment) {
      setCurrentTime(trimStart);
    }
  }, [selectedSegment, trimStart]);

  // Handlers
  const handlePlayPause = useCallback(() => setIsPlaying(prev => !prev), []);

  const handleSeek = useCallback((time: number) => {
    const clampedTime = Math.max(trimStart, Math.min(trimEnd || 9999, time));
    setCurrentTime(clampedTime);
  }, [trimStart, trimEnd]);

  const handleSeekRelative = useCallback((relativeSec: number) => {
    handleSeek(trimStart + relativeSec);
  }, [handleSeek, trimStart]);

  const handleExport = async (options: any) => {
    if (!selectedSegment || !project) return;
    try {
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
          title: 'Export lancé',
          message: 'Votre clip a été ajouté à la file d\'attente',
        });
        setShowExportModal(false);
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible de lancer l\'export' });
    }
  };

  // One-click fast export (defaults, no modal)
  const handleQuickExport = async () => {
    if (!selectedSegment || !project) return;
    try {
      const facecamZone = zones.find(z => z.type === 'facecam');
      const contentZone = zones.find(z => z.type === 'content');
      const layoutConfig = {
        facecam: facecamZone ? { x: facecamZone.x, y: facecamZone.y, width: facecamZone.width, height: facecamZone.height, sourceCrop: facecamZone.sourceCrop } : undefined,
        content: contentZone ? { x: contentZone.x, y: contentZone.y, width: contentZone.width, height: contentZone.height, sourceCrop: contentZone.sourceCrop } : undefined,
        facecamRatio: facecamZone ? facecamZone.height / 100 : 0.4,
      };
      const response = await api.exportSegment(project.id, {
        segmentId: selectedSegment.id,
        variant: 'A',
        platform: 'tiktok',
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: false,
        includeMetadata: true,
        includePost: false,
        useNvenc: true,
        captionStyle: subtitleStyle as any,
        layoutConfig,
        introConfig: introConfig.enabled ? introConfig : undefined,
        jumpCutConfig: jumpCutConfig.enabled ? jumpCutConfig : undefined,
        languages: [],
      });
      if (response.data?.jobId) {
        addToast({ type: 'success', title: 'Export rapide lancé', message: 'Configuration par défaut appliquée' });
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Erreur', message: 'Export rapide impossible' });
    }
  };

  // Cycle segments
  const cycleSegment = useCallback((dir: 1 | -1) => {
    if (!selectedSegment || segments.length === 0) return;
    const idx = segments.findIndex(s => s.id === selectedSegment.id);
    const nextIdx = (idx + dir + segments.length) % segments.length;
    const nextSeg = segments[nextIdx];
    if (nextSeg) {
      setSelectedSegment(nextSeg);
      setTrimStart(nextSeg.startTime);
      setTrimEnd(nextSeg.endTime);
    }
  }, [selectedSegment, segments]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showExportModal) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'j':
          handleSeek(currentTime - 0.5);
          break;
        case 'k':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'L':
        case 'l':
          if (e.shiftKey || e.ctrlKey) {
            handleSeek(currentTime + 0.5);
          } else {
            setIsLooping(lp => !lp);
          }
          break;
        case 'm':
          setIsMuted(m => !m);
          break;
        case '[':
          handleSeek(currentTime - 1);
          break;
        case ']':
          handleSeek(currentTime + 1);
          break;
        case ',':
          handleSeek(currentTime - 1 / 30);
          break;
        case '.':
          handleSeek(currentTime + 1 / 30);
          break;
        case 'ArrowLeft':
          if (e.shiftKey) cycleSegment(-1); else handleSeek(currentTime - (e.altKey ? 5 : 1));
          break;
        case 'ArrowRight':
          if (e.shiftKey) cycleSegment(1); else handleSeek(currentTime + (e.altKey ? 5 : 1));
          break;
        case '1': setActiveTab('layout'); break;
        case '2': setActiveTab('subtitles'); break;
        case '3': setActiveTab('transcript'); break;
        case '4': setActiveTab('music'); break;
        case '5': setActiveTab('intro'); break;
        case '6': setActiveTab('export'); break;
        case 'Escape':
          if (isEditingTitle) setIsEditingTitle(false);
          else navigate(`/project/${projectId}`);
          break;
        case 'E':
        case 'e':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowExportModal(true);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentTime, handlePlayPause, handleSeek, cycleSegment, showExportModal, isEditingTitle, navigate, projectId]);

  // Loading states
  if (projectLoading || (loading && segments.length === 0)) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0F]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-viral-medium border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0F] text-white">
        <p className="text-gray-400">Projet introuvable</p>
        <button
          className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          onClick={() => navigate('/')}
        >
          Retour
        </button>
      </div>
    );
  }

  const currentSegmentTitle = selectedSegment?.topicLabel || selectedSegment?.hookText || 'Clip sans titre';
  const score = selectedSegment?.score?.total ?? 0;

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F] text-white overflow-hidden select-none">
      {/* ─────────────── HERO ─────────────── */}
      <ClipEditorHero
        title={isEditingTitle ? titleDraft : currentSegmentTitle}
        editing={isEditingTitle}
        onStartEdit={() => { setTitleDraft(currentSegmentTitle); setIsEditingTitle(true); }}
        onCommitEdit={(value) => {
          setIsEditingTitle(false);
          if (selectedSegment && value !== selectedSegment.topicLabel) {
            setSelectedSegment({ ...selectedSegment, topicLabel: value });
          }
        }}
        onCancelEdit={() => setIsEditingTitle(false)}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
        score={score}
        duration={clipDuration}
        onBack={() => navigate(`/project/${projectId}`)}
        segmentIndex={selectedSegment ? segments.findIndex(s => s.id === selectedSegment.id) : -1}
        segmentsTotal={segments.length}
        onPrev={() => cycleSegment(-1)}
        onNext={() => cycleSegment(1)}
      />

      {/* ─────────────── BODY ─────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* STAGE */}
        <ClipEditorStage
          videoSrc={mediaUrl(projectId!, 'proxy')}
          currentTime={currentTime}
          isPlaying={isPlaying}
          isMuted={isMuted}
          isLooping={isLooping}
          trimStart={trimStart}
          trimEnd={trimEnd}
          clipDuration={clipDuration}
          relativeTime={relativeTime}
          currentSubtitle={selectedSegment?.transcript || ''}
          faceDetections={faceDetections}
          wordTimings={scopedWordTimings}
          rawWordTimings={wordTimings}
          waveformData={waveformData}
          onTimeUpdate={(time) => {
            setCurrentTime(time);
            if (time >= trimEnd) {
              if (isLooping) setCurrentTime(trimStart);
              else setIsPlaying(false);
            }
          }}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSeekRelative={handleSeekRelative}
          onToggleMute={() => setIsMuted(m => !m)}
          onToggleLoop={() => setIsLooping(l => !l)}
        />

        {/* RAIL */}
        <ClipEditorRail
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed(c => !c)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === 'layout' && (
            <LayoutTab
              zones={zones}
              selectedZoneId={selectedZoneId}
              presetName={presetName}
              onZoneSelect={setSelectedZone}
              onZoneUpdate={updateZone}
              onApplyPreset={applyPreset}
            />
          )}
          {activeTab === 'subtitles' && (
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
          {activeTab === 'transcript' && (
            <TranscriptTab
              wordTimings={wordTimings}
              transcript={selectedSegment?.transcript || ''}
              relativeTime={currentTime}
              trimStart={trimStart}
              onWordClick={(t) => handleSeek(t)}
              onSavedText={async (text) => {
                if (!projectId || !selectedSegment) return;
                try {
                  await api.updateTranscript(projectId, selectedSegment.id, {
                    words: wordTimings.map((w, i) => ({ ...w, word: text.split(/\s+/)[i] ?? w.word })),
                    text,
                  });
                  addToast({ type: 'success', title: 'Transcription sauvegardée' });
                } catch (e) {
                  addToast({ type: 'error', title: 'Impossible de sauvegarder' });
                }
              }}
            />
          )}
          {activeTab === 'music' && (
            <MusicPanel
              selectedMusic={selectedMusic}
              musicList={musicList}
              onMusicSelect={setSelectedMusic}
              onMusicListUpdate={setMusicList}
              videoRef={videoRef}
              musicRef={musicRef}
            />
          )}
          {activeTab === 'intro' && (
            <IntroPanel
              config={introConfig}
              segmentTitle={selectedSegment?.topicLabel || ''}
              onConfigChange={setIntroConfig}
              onApplyPreset={applyIntroPreset}
            />
          )}
          {activeTab === 'jumpcuts' && (
            <JumpCutTab
              projectId={projectId || ''}
              segmentId={selectedSegment?.id || ''}
              segmentDuration={selectedSegment?.duration || 0}
            />
          )}
          {activeTab === 'audio' && (
            <AudioMixerTab audioTracks={audioTracks} onTracksChange={setAudioTracks} />
          )}
          {activeTab === 'templates' && (
            <div className="-m-4">
              <TemplateStudio />
            </div>
          )}
          {activeTab === 'export' && (
            <ExportTab
              onOpenModal={() => setShowExportModal(true)}
              onQuickExport={handleQuickExport}
              introEnabled={!!introConfig.enabled}
              jumpCutsEnabled={!!jumpCutConfig.enabled}
              subtitlePreset={subtitlePreset}
              segmentName={currentSegmentTitle}
              duration={clipDuration}
            />
          )}
        </ClipEditorRail>
      </div>

      {/* ─────────────── ACTION BAR ─────────────── */}
      <ClipEditorActionBar
        onExport={() => setShowExportModal(true)}
        onQuickExport={handleQuickExport}
        onRegenerate={() => addToast({ type: 'info', title: 'Régénération', message: 'Fonction à venir' })}
        disabled={!selectedSegment}
      />

      {/* Export modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        segmentName={currentSegmentTitle}
        duration={clipDuration}
        onExport={handleExport}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// HERO
// ────────────────────────────────────────────────────────────────

interface HeroProps {
  title: string;
  editing: boolean;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  onStartEdit: () => void;
  onCommitEdit: (value: string) => void;
  onCancelEdit: () => void;
  score: number;
  duration: number;
  onBack: () => void;
  segmentIndex: number;
  segmentsTotal: number;
  onPrev: () => void;
  onNext: () => void;
}

function ClipEditorHero({
  title, editing, titleDraft, setTitleDraft,
  onStartEdit, onCommitEdit, onCancelEdit,
  score, duration, onBack, segmentIndex, segmentsTotal, onPrev, onNext,
}: HeroProps) {
  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-viral-medium' : 'text-gray-400';

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-[#0A0A0F]/95 backdrop-blur-xl border-b border-white/5 flex-shrink-0 relative z-20">
      {/* Left: Back */}
      <div className="flex items-center gap-3 w-64">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          title="Retour au projet (Esc)"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Clip Editor</div>
      </div>

      {/* Center: title (editable) */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
        <button
          onClick={onPrev}
          disabled={segmentsTotal <= 1}
          className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Segment précédent (Shift+←)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {editing ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => onCommitEdit(titleDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit(titleDraft);
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            className="bg-transparent border-b border-viral-medium/60 px-1 text-center text-sm font-medium outline-none max-w-md text-white"
          />
        ) : (
          <button
            onClick={onStartEdit}
            className="text-sm font-medium text-white/90 hover:text-white max-w-md truncate px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
            title="Cliquer pour renommer"
          >
            {title}
          </button>
        )}

        <button
          onClick={onNext}
          disabled={segmentsTotal <= 1}
          className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Segment suivant (Shift+→)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right: score + duration */}
      <div className="flex items-center gap-3 w-64 justify-end">
        {segmentsTotal > 0 && (
          <div className="text-[10px] font-mono text-gray-500">
            {segmentIndex + 1}/{segmentsTotal}
          </div>
        )}
        <div className={`flex items-center gap-1 ${scoreColor}`}>
          <div className="text-xs font-mono tabular-nums">{score}</div>
          <div className="text-[10px] text-gray-500 uppercase">score</div>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="text-xs font-mono text-gray-400 tabular-nums">{formatDuration(duration)}</div>
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────
// STAGE
// ────────────────────────────────────────────────────────────────

interface StageProps {
  videoSrc: string;
  currentTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  isLooping: boolean;
  trimStart: number;
  trimEnd: number;
  clipDuration: number;
  relativeTime: number;
  currentSubtitle: string;
  faceDetections: any[];
  wordTimings: WordTiming[];
  rawWordTimings: WordTiming[];
  waveformData: number[];
  onTimeUpdate: (time: number) => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSeekRelative: (relativeSec: number) => void;
  onToggleMute: () => void;
  onToggleLoop: () => void;
}

function ClipEditorStage({
  videoSrc, currentTime, isPlaying, isMuted, isLooping,
  trimStart, trimEnd: _trimEnd, clipDuration, relativeTime,
  currentSubtitle, faceDetections, wordTimings, rawWordTimings, waveformData,
  onTimeUpdate, onPlayPause, onSeek, onSeekRelative, onToggleMute, onToggleLoop,
}: StageProps) {
  const scrubRef = useRef<HTMLDivElement>(null);
  const [isHoveringScrub, setIsHoveringScrub] = useState(false);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const progress = clipDuration > 0 ? Math.min(100, (relativeTime / clipDuration) * 100) : 0;

  const handleScrubClick = (e: React.MouseEvent) => {
    if (!scrubRef.current || clipDuration <= 0) return;
    const rect = scrubRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(trimStart + ratio * clipDuration);
  };

  const handleScrubMove = (e: React.MouseEvent) => {
    if (!scrubRef.current) return;
    const rect = scrubRef.current.getBoundingClientRect();
    setHoverProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  // Word markers on scrubber (relative to clip)
  const wordMarkers = useMemo(() => {
    if (clipDuration <= 0) return [];
    return wordTimings.slice(0, 200).map(w => ({
      position: (w.start / clipDuration) * 100,
      word: w.word,
    }));
  }, [wordTimings, clipDuration]);

  // Waveform bars (downsample to reasonable bar count)
  const waveformBars = useMemo(() => {
    if (!waveformData.length) {
      // generate pseudo waveform from noise so it still looks alive
      return Array.from({ length: 120 }, () => {
        const base = Math.random() * 0.3 + 0.15;
        return Math.random() > 0.8 ? base + 0.4 : base;
      });
    }
    const target = 120;
    if (waveformData.length <= target) return waveformData;
    const step = Math.floor(waveformData.length / target);
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      const start = i * step;
      const chunk = waveformData.slice(start, start + step);
      const max = chunk.reduce((m, v) => v > m ? v : m, 0);
      out.push(max);
    }
    return out;
  }, [waveformData]);

  return (
    <div className={`flex-1 flex flex-col bg-gradient-to-b from-[#05050a] via-[#0A0A0F] to-[#05050a] relative overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-viral-medium/5 rounded-full blur-[120px]" />
      </div>

      {/* Video region */}
      <div className="flex-1 flex items-center justify-center p-6 relative min-h-0">
        <motion.div
          layout
          className="relative flex items-center justify-center"
          style={{ aspectRatio: '9/16', maxHeight: '100%', height: '100%' }}
        >
          <div className="relative h-full aspect-[9/16] rounded-xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/5 bg-black">
            <Canvas9x16
              videoSrc={videoSrc}
              currentTime={currentTime}
              isPlaying={isPlaying}
              currentSubtitle={currentSubtitle}
              faceDetections={faceDetections}
              wordTimings={wordTimings}
              clipStartTime={trimStart}
              clipDuration={clipDuration}
              onTimeUpdate={onTimeUpdate}
              onPlayPause={onPlayPause}
            />
            {/* Subtle top progress */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-viral-medium to-emerald-400"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>
            {/* Fullscreen button */}
            <button
              onClick={() => setIsFullscreen(f => !f)}
              className="absolute top-3 right-3 p-1.5 rounded-md bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-sm transition-colors"
              title="Cinéma (F11)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Scrubber + controls */}
      <div className="flex-shrink-0 px-6 pb-6 pt-2 space-y-3 relative z-10">
        {/* Waveform + scrubber */}
        <div
          ref={scrubRef}
          className="relative h-16 cursor-pointer group"
          onMouseEnter={() => setIsHoveringScrub(true)}
          onMouseLeave={() => setIsHoveringScrub(false)}
          onMouseMove={handleScrubMove}
          onClick={handleScrubClick}
        >
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center gap-[1px] px-0.5">
            {waveformBars.map((v, i) => {
              const barProgress = (i / waveformBars.length) * 100;
              const isActive = barProgress <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-colors"
                  style={{
                    height: `${Math.max(4, v * 100)}%`,
                    backgroundColor: isActive ? 'rgb(245 158 11 / 0.9)' : 'rgb(255 255 255 / 0.12)',
                  }}
                />
              );
            })}
          </div>

          {/* Word markers */}
          {isHoveringScrub && wordMarkers.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-white/20"
              style={{ left: `${m.position}%` }}
            />
          ))}

          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none shadow-[0_0_10px_rgba(255,255,255,0.6)]"
            style={{ left: `${progress}%` }}
            animate={{ left: `${progress}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
          </motion.div>

          {/* Hover preview */}
          {isHoveringScrub && (
            <div
              className="absolute -top-6 text-[10px] font-mono text-gray-400 bg-black/70 border border-white/10 rounded px-1.5 py-0.5 pointer-events-none"
              style={{ left: `${hoverProgress * 100}%`, transform: 'translateX(-50%)' }}
            >
              {formatTime(hoverProgress * clipDuration)}
            </div>
          )}
        </div>

        {/* Transport */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSeekRelative(0)}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Retour début"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onPlayPause}
              className="relative w-11 h-11 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-95 transition-transform shadow-lg"
              title="Lecture/Pause (Espace)"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={onToggleLoop}
              className={`p-2 rounded-md transition-colors ${isLooping ? 'text-viral-medium bg-viral-medium/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              title="Loop (L)"
            >
              <Repeat className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleMute}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors ml-1"
              title="Mute (M)"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="font-mono text-xs text-gray-400 tabular-nums">
            <span className="text-white">{formatTime(relativeTime)}</span>
            <span className="text-gray-600 mx-1">/</span>
            <span>{formatTime(clipDuration)}</span>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-600">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">Espace</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">[ ]</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{rawWordTimings.length > 0 ? 'J K L' : 'M'}</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// RAIL
// ────────────────────────────────────────────────────────────────

interface RailProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeTab: RailTab;
  onTabChange: (tab: RailTab) => void;
  children: React.ReactNode;
}

const RAIL_TABS: Array<{ id: RailTab; icon: any; label: string; shortcut: string }> = [
  { id: 'layout', icon: Layers, label: 'Layout', shortcut: '1' },
  { id: 'subtitles', icon: Type, label: 'Sous-titres', shortcut: '2' },
  { id: 'transcript', icon: FileText, label: 'Transcript', shortcut: '3' },
  { id: 'music', icon: Music, label: 'Musique', shortcut: '4' },
  { id: 'intro', icon: Film, label: 'Intro', shortcut: '5' },
  { id: 'jumpcuts', icon: Zap, label: 'Jump Cuts', shortcut: '' },
  { id: 'audio', icon: SlidersHorizontal, label: 'Audio Mix', shortcut: '' },
  { id: 'templates', icon: Save, label: 'Templates', shortcut: '' },
  { id: 'export', icon: Rocket, label: 'Export', shortcut: '6' },
];

function ClipEditorRail({ collapsed, onToggleCollapsed, activeTab, onTabChange, children }: RailProps) {
  return (
    <motion.aside
      layout
      animate={{ width: collapsed ? 60 : 360 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="flex-shrink-0 bg-[#0A0A0F] border-l border-white/5 flex overflow-hidden relative z-10"
    >
      {/* Tab rail */}
      <div className="w-[60px] border-r border-white/5 flex flex-col items-center py-3 gap-1 flex-shrink-0">
        <button
          onClick={onToggleCollapsed}
          className="p-2 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors mb-2"
          title={collapsed ? 'Ouvrir le panneau' : 'Replier'}
        >
          {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {RAIL_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); if (collapsed) onToggleCollapsed(); }}
              className={`relative w-11 h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all group ${
                active
                  ? 'bg-viral-medium/10 text-viral-medium'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
              title={`${tab.label}${tab.shortcut ? ` (${tab.shortcut})` : ''}`}
            >
              <Icon className="w-4 h-4" />
              {active && (
                <motion.div
                  layoutId="railActiveIndicator"
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-viral-medium"
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                />
              )}
              {tab.shortcut && (
                <span className="text-[8px] font-mono text-gray-600">{tab.shortcut}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      {!collapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Panneau</div>
              <div className="text-sm font-medium text-white">
                {RAIL_TABS.find(t => t.id === activeTab)?.label}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.aside>
  );
}

// ────────────────────────────────────────────────────────────────
// ACTION BAR
// ────────────────────────────────────────────────────────────────

interface ActionBarProps {
  onExport: () => void;
  onQuickExport: () => void;
  onRegenerate: () => void;
  disabled: boolean;
}

function ClipEditorActionBar({ onExport, onQuickExport, onRegenerate, disabled }: ActionBarProps) {
  return (
    <footer className="h-14 flex-shrink-0 px-4 bg-[#0A0A0F] border-t border-white/5 flex items-center justify-between gap-3 relative z-10">
      <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">Ctrl+E</kbd>
        <span>Export</span>
        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ml-3">1–6</kbd>
        <span>Onglets</span>
        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ml-3">Esc</kbd>
        <span>Retour</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRegenerate}
          disabled={disabled}
          className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          Régénérer
        </button>
        <button
          onClick={onQuickExport}
          disabled={disabled}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-viral-medium bg-viral-medium/10 hover:bg-viral-medium/20 transition-colors flex items-center gap-1.5 disabled:opacity-40"
          title="Export rapide avec réglages par défaut"
        >
          <Zap className="w-3.5 h-3.5" />
          Rapide
        </button>
        <motion.button
          onClick={onExport}
          disabled={disabled}
          whileHover={{ scale: disabled ? 1 : 1.03 }}
          whileTap={{ scale: disabled ? 1 : 0.97 }}
          className="relative px-5 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-viral-medium to-emerald-400 text-black shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_40px_rgba(245,158,11,0.5)] transition-shadow flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          Exporter TikTok
        </motion.button>
      </div>
    </footer>
  );
}

// ────────────────────────────────────────────────────────────────
// RAIL TABS
// ────────────────────────────────────────────────────────────────

// — Layout —
function LayoutTab({
  zones, selectedZoneId, presetName, onZoneSelect, onZoneUpdate, onApplyPreset,
}: {
  zones: any[];
  selectedZoneId: string | null;
  presetName: string;
  onZoneSelect: (id: string | null) => void;
  onZoneUpdate: (id: string, updates: any) => void;
  onApplyPreset: (preset: string) => void;
}) {
  const presets = [
    { id: 'facecam-top', label: 'Facecam haut', hint: 'Top cam + bottom content' },
    { id: 'facecam-bottom', label: 'Facecam bas', hint: 'Bottom cam + top content' },
    { id: 'split-50-50', label: '50/50', hint: 'Split parts égales' },
    { id: 'pip-corner', label: 'PIP coin', hint: 'Picture-in-picture' },
    { id: 'content-only', label: 'Contenu seul', hint: 'Full screen content' },
  ];
  const selectedZone = zones.find(z => z.id === selectedZoneId);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Presets</div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => onApplyPreset(p.id)}
              className={`p-3 rounded-lg text-left transition-all ${
                presetName === p.id
                  ? 'bg-viral-medium/10 border border-viral-medium/50 text-white'
                  : 'bg-white/[0.03] border border-white/5 hover:bg-white/5 text-gray-300'
              }`}
            >
              <div className="text-xs font-medium">{p.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Zones</div>
        <div className="space-y-1.5">
          {zones.map(z => (
            <button
              key={z.id}
              onClick={() => onZoneSelect(z.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                selectedZoneId === z.id ? 'bg-white/10 border border-white/20' : 'bg-white/[0.03] border border-transparent hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${z.type === 'facecam' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                <span className="text-xs font-medium capitalize">{z.type}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {Math.round(z.width)}×{Math.round(z.height)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedZone && (
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Position 9:16</div>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'width', 'height'] as const).map(k => (
                <label key={k} className="block">
                  <span className="text-[10px] text-gray-500 block mb-1">{k === 'x' ? 'X' : k === 'y' ? 'Y' : k === 'width' ? 'Largeur' : 'Hauteur'} (%)</span>
                  <input
                    type="number"
                    value={Math.round(selectedZone[k])}
                    onChange={(e) => onZoneUpdate(selectedZone.id, { [k]: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-viral-medium/60"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Crop source 16:9</div>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'width', 'height'] as const).map(k => (
                <label key={k} className="block">
                  <span className="text-[10px] text-gray-500 block mb-1">{k} (0-1)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={k === 'width' || k === 'height' ? 0.1 : 0}
                    max="1"
                    value={(selectedZone.sourceCrop?.[k] ?? (k === 'width' || k === 'height' ? 1 : 0)).toFixed(2)}
                    onChange={(e) => onZoneUpdate(selectedZone.id, {
                      sourceCrop: {
                        ...(selectedZone.sourceCrop || { x: 0, y: 0, width: 1, height: 1 }),
                        [k]: Math.max(k === 'width' || k === 'height' ? 0.1 : 0, Math.min(1, Number(e.target.value))),
                      },
                    })}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-viral-medium/60"
                  />
                </label>
              ))}
            </div>
            {selectedZone.type === 'facecam' && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedZone.autoTrack ?? false}
                  onChange={(e) => onZoneUpdate(selectedZone.id, { autoTrack: e.target.checked })}
                  className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-viral-medium"
                />
                <span className="text-xs text-gray-400">Auto-tracking (suit le visage)</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-500 leading-relaxed border-t border-white/5 pt-3">
        Glisse les zones sur le canvas pour repositionner. Les coins redimensionnent.
      </div>
    </div>
  );
}

// — Transcript —
function TranscriptTab({
  wordTimings, transcript, relativeTime, trimStart, onWordClick, onSavedText,
}: {
  wordTimings: WordTiming[];
  transcript: string;
  relativeTime: number;
  trimStart: number;
  onWordClick: (t: number) => void;
  onSavedText: (text: string) => void;
}) {
  const [mode, setMode] = useState<'karaoke' | 'raw'>('karaoke');
  const [draft, setDraft] = useState(transcript);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(transcript); }, [transcript]);

  if (!wordTimings.length && !transcript) {
    return (
      <div className="text-xs text-gray-500 text-center py-8">
        Aucune transcription disponible pour ce segment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg">
        <button
          onClick={() => setMode('karaoke')}
          className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
            mode === 'karaoke' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Mots · cliquable
        </button>
        <button
          onClick={() => setMode('raw')}
          className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
            mode === 'raw' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Texte brut
        </button>
      </div>

      {mode === 'karaoke' ? (
        <div className="text-sm leading-relaxed text-gray-300 flex flex-wrap gap-1 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
          {wordTimings.length ? wordTimings.map((w, i) => {
            const active = relativeTime >= w.start && relativeTime <= w.end;
            const past = relativeTime > w.end;
            return (
              <button
                key={i}
                onClick={() => onWordClick(w.start)}
                className={`rounded px-1 transition-all ${
                  active ? 'bg-viral-medium/30 text-white' : past ? 'text-white/80' : 'text-gray-500 hover:text-white'
                }`}
                title={`${formatTime(w.start - trimStart)}`}
              >
                {w.word}
              </button>
            );
          }) : (
            <p className="text-gray-400 text-xs italic">Pas de timings mots. Utilise l'onglet Sous-titres pour l'édition détaillée.</p>
          )}
        </div>
      ) : (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-viral-medium/50 font-mono"
          />
          <button
            onClick={async () => { setSaving(true); await onSavedText(draft); setSaving(false); }}
            disabled={saving || draft === transcript}
            className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium bg-viral-medium/20 text-viral-medium hover:bg-viral-medium/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {saving ? 'Sauvegarde…' : <><Check className="w-3 h-3" /> Enregistrer</>}
          </button>
        </div>
      )}
    </div>
  );
}

// — Jump Cut —
function JumpCutTab({
  projectId, segmentId, segmentDuration: _segmentDuration,
}: {
  projectId: string;
  segmentId: string;
  segmentDuration: number;
}) {
  const { config, analysis, analyzing, setEnabled, setSensitivity, setTransition, setAnalysis, setAnalyzing } = useJumpCutStore();
  const { addToast } = useToastStore();

  const handleAnalyze = async () => {
    if (!projectId || !segmentId) {
      addToast({ type: 'error', title: 'Erreur', message: 'Sélectionne un segment' });
      return;
    }
    setAnalyzing(true);
    try {
      const result = await api.analyzeJumpCuts(projectId, segmentId, { sensitivity: config.sensitivity });
      if (result.data) {
        setAnalysis(result.data);
        addToast({
          type: 'success',
          title: 'Analyse terminée',
          message: `${result.data.cuts_count} cuts (-${result.data.time_saved_percent.toFixed(0)}%)`,
        });
      }
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'L\'analyse a échoué' });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-viral-medium" />
            Jump Cuts
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">Supprime les silences</div>
        </div>
        <button
          onClick={() => setEnabled(!config.enabled)}
          className={`relative w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-viral-medium' : 'bg-white/10'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Sensibilité</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: 'light', label: 'Léger', desc: '600ms+' },
            { id: 'normal', label: 'Normal', desc: '400ms+' },
            { id: 'aggressive', label: 'Agressif', desc: '250ms+' },
          ] as const).map(o => (
            <button
              key={o.id}
              onClick={() => setSensitivity(o.id)}
              className={`p-2 rounded-lg text-center transition-all ${
                config.sensitivity === o.id
                  ? 'bg-viral-medium/15 border border-viral-medium/50 text-viral-medium'
                  : 'bg-white/[0.03] border border-white/5 text-gray-400 hover:bg-white/5'
              }`}
            >
              <div className="text-[11px] font-medium">{o.label}</div>
              <div className="text-[9px] opacity-60">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-2">Transition</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: 'hard', label: 'Hard' },
            { id: 'zoom', label: 'Zoom' },
            { id: 'crossfade', label: 'Fondu' },
          ] as const).map(o => (
            <button
              key={o.id}
              onClick={() => setTransition(o.id)}
              className={`py-2 rounded-lg text-xs transition-all ${
                config.transition === o.id
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'bg-white/[0.03] border border-white/5 text-gray-400 hover:bg-white/5'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={analyzing || !segmentId}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-viral-medium to-orange-400 text-black flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {analyzing ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Analyse…
          </>
        ) : (
          <>
            <Scissors className="w-3.5 h-3.5" />
            Analyser les silences
          </>
        )}
      </button>

      {analysis && (
        <div className="p-3 rounded-lg bg-viral-medium/5 border border-viral-medium/20">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="text-center">
              <div className="text-lg font-bold text-viral-medium">{analysis.cuts_count}</div>
              <div className="text-[10px] text-gray-500">cuts</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">-{analysis.time_saved_percent.toFixed(0)}%</div>
              <div className="text-[10px] text-gray-500">temps</div>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 font-mono text-center">
            {formatTime(analysis.original_duration)} → {formatTime(analysis.new_duration)}
          </div>
        </div>
      )}
    </div>
  );
}

// — Audio Mixer —
function AudioMixerTab({ audioTracks, onTracksChange }: { audioTracks: AudioTrack[]; onTracksChange: (tracks: AudioTrack[]) => void }) {
  const handleUpdate = (trackId: string, patch: Partial<AudioTrack>) => {
    onTracksChange(audioTracks.map(t => t.id === trackId ? { ...t, ...patch } : t));
  };

  return (
    <div className="space-y-3">
      {audioTracks.map(track => (
        <div key={track.id} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{track.name}</span>
            <div className="flex gap-1">
              <button
                onClick={() => handleUpdate(track.id, { muted: !track.muted })}
                className={`w-6 h-6 text-[10px] font-bold rounded ${track.muted ? 'bg-red-500/30 text-red-400' : 'bg-white/5 text-gray-500'}`}
              >
                M
              </button>
              <button
                onClick={() => handleUpdate(track.id, { solo: !track.solo })}
                className={`w-6 h-6 text-[10px] font-bold rounded ${track.solo ? 'bg-viral-medium/30 text-viral-medium' : 'bg-white/5 text-gray-500'}`}
              >
                S
              </button>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>Volume</span>
              <span className="font-mono">{track.volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={track.volume}
              onChange={e => handleUpdate(track.id, { volume: parseInt(e.target.value) })}
              className="w-full accent-viral-medium"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>Pan</span>
              <span className="font-mono">{track.pan > 0 ? `R${track.pan}` : track.pan < 0 ? `L${Math.abs(track.pan)}` : 'C'}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={track.pan}
              onChange={e => handleUpdate(track.id, { pan: parseInt(e.target.value) })}
              className="w-full accent-viral-medium"
            />
          </div>
        </div>
      ))}
      <div className="text-[10px] text-gray-500 leading-relaxed border-t border-white/5 pt-3">
        Ajuste chaque piste. <span className="font-mono">M</span> mute, <span className="font-mono">S</span> solo.
      </div>
    </div>
  );
}

// — Export —
function ExportTab({
  onOpenModal, onQuickExport, introEnabled, jumpCutsEnabled, subtitlePreset, segmentName, duration,
}: {
  onOpenModal: () => void;
  onQuickExport: () => void;
  introEnabled: boolean;
  jumpCutsEnabled: boolean;
  subtitlePreset: string;
  segmentName: string;
  duration: number;
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-gradient-to-br from-viral-medium/10 via-transparent to-emerald-400/5 border border-viral-medium/20">
        <div className="text-[10px] uppercase tracking-[0.2em] text-viral-medium mb-1">Prêt à l'envoi</div>
        <div className="text-sm font-medium text-white mb-0.5 truncate">{segmentName}</div>
        <div className="text-[11px] text-gray-400 font-mono">{formatTime(duration)} · 1080×1920 · MP4</div>
      </div>

      <div className="space-y-1.5 text-[11px]">
        <Summary label="Sous-titres" value={subtitlePreset} />
        <Summary label="Intro" value={introEnabled ? 'Activée' : 'Désactivée'} muted={!introEnabled} />
        <Summary label="Jump cuts" value={jumpCutsEnabled ? 'Activés' : 'Désactivés'} muted={!jumpCutsEnabled} />
      </div>

      <motion.button
        onClick={onOpenModal}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-viral-medium to-emerald-400 text-black flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(245,158,11,0.3)]"
      >
        <Rocket className="w-4 h-4" />
        Exporter TikTok
      </motion.button>

      <button
        onClick={onQuickExport}
        className="w-full py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white transition-colors flex items-center justify-center gap-2"
      >
        <Zap className="w-3.5 h-3.5" />
        Export rapide (défauts)
      </button>

      <div className="text-[10px] text-gray-500 leading-relaxed border-t border-white/5 pt-3 space-y-1">
        <div><kbd className="px-1 bg-white/5 rounded">Ctrl+E</kbd> pour ouvrir</div>
        <div>L'export se lance en arrière-plan. Suis l'état dans le tiroir Jobs.</div>
      </div>
    </div>
  );
}

function Summary({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/5">
      <span className="text-gray-500">{label}</span>
      <span className={muted ? 'text-gray-500' : 'text-white font-medium'}>{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
