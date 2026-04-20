import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENGINE_BASE_URL } from '@/lib/config';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Zap,
  Download,
  Filter,
  Grid3X3,
  LayoutList,
  Check,
  Rocket,
  Loader2,
  X,
  ChevronDown,
  Columns,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useSegmentStats, useSegmentTags, useSegmentSuggestions } from '@/lib/queries';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { SegmentFilterBar, type FilterState, type SegmentStats } from '@/components/segments/SegmentFilterBar';
import { useSegmentFilterStore, useToastStore } from '@/store';
import { useSegmentNavigation } from '@/hooks/useSegmentNavigation';
import { useDebounce } from '@/hooks/useDebounce';
import { SegmentPreview } from '@/components/project/SegmentPreview';
import { SegmentScoreCard } from '@/components/project/SegmentScoreCard';
import SegmentComparisonModal from '@/components/project/SegmentComparisonModal';

interface ForgePanelProps {
  project: {
    id: string;
    duration?: number;
    proxy_path?: string;
    source_path?: string;
  };
}

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  topicLabel?: string;
  hookText?: string;
  transcript?: string;
  score: {
    total: number;
    hookStrength: number;
    payoff: number;
    humourReaction: number;
    tensionSurprise: number;
    clarityAutonomy: number;
    rhythm: number;
    reasons: string[];
    tags: string[];
  };
}

type SortMode = 'score' | 'duration' | 'time';

export default function ForgePanel({ project }: ForgePanelProps) {
  const navigate = useNavigate();
  useToastStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  
  // Stats from backend (via React Query)
  const { data: statsData } = useSegmentStats(project.id);
  const segmentStats = (statsData?.data ?? null) as SegmentStats | null;

  const [totalFiltered, setTotalFiltered] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Persisted filter state from store
  const {
    minScore, minDuration, maxDuration, limit,
    sortBy, viewMode, search, selectedTags,
    setFilters: setStoreFilters,
    setSearch,
    setSelectedTags,
  } = useSegmentFilterStore();

  // Debounce search input to avoid API calls on every keystroke
  const debouncedSearch = useDebounce(search, 300);

  // Available tags for this project (via React Query)
  const { data: tagsData } = useSegmentTags(project.id);
  const availableTags = (tagsData?.data?.tags ?? []) as string[];

  // Smart suggestions (via React Query)
  const { data: suggestionsData } = useSegmentSuggestions(project.id);
  const suggestions = useMemo(() => {
    if (!suggestionsData?.data?.suggestions) return [];
    return suggestionsData.data.suggestions.map((seg: Segment) => ({
      segment: seg,
      reason: suggestionsData.data!.reasons[seg.id] || 'Recommandé',
    }));
  }, [suggestionsData]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  const filters: FilterState = { minScore, minDuration, maxDuration, limit, search, tags: selectedTags };
  
  const setFilters = (newFilters: FilterState) => {
    setStoreFilters(newFilters);
  };
  
  const setSortBy = (sort: SortMode) => {
    setStoreFilters({ sortBy: sort });
  };
  
  const setViewMode = (mode: 'grid' | 'list') => {
    setStoreFilters({ viewMode: mode });
  };
  
  // Batch export state
  const [showBatchExportModal, setShowBatchExportModal] = useState(false);
  const [batchExportLoading, setBatchExportLoading] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [batchPlatform, setBatchPlatform] = useState<'tiktok' | 'youtube_shorts' | 'instagram' | 'twitter'>('tiktok');
  
  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // A/B comparison state — populated when exactly two segments are checked
  // and the user hits the "Comparer" button.
  const [comparing, setComparing] = useState<{ a: Segment; b: Segment } | null>(null);

  // After segments load, auto-select top 5 high-score candidates
  // Handles both camelCase (score.total, startTime/endTime) and snake_case fallbacks
  useEffect(() => {
    if (segments.length > 0 && selectedIds.length === 0 && !hasAutoSelected) {
      const topCandidates = segments
        .filter((s: any) => {
          const score = s.score?.total ?? s.score_total ?? 0;
          const duration = s.duration ?? ((s.endTime ?? s.end_time ?? 0) - (s.startTime ?? s.start_time ?? 0));
          return score >= 70 && duration >= 30 && duration <= 60;
        })
        .sort((a: any, b: any) => {
          const sa = a.score?.total ?? a.score_total ?? 0;
          const sb = b.score?.total ?? b.score_total ?? 0;
          return sb - sa;
        })
        .slice(0, 5);
      if (topCandidates.length > 0) {
        setSelectedIds(topCandidates.map((s) => s.id));
        setMultiSelectMode(true);
        setHasAutoSelected(true);
      }
    }
  }, [segments, selectedIds.length, hasAutoSelected]);

  // Load segments when filters change — use debouncedSearch to avoid API call on every keystroke
  useEffect(() => {
    setCurrentPage(1);
    loadSegments(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, minScore, minDuration, maxDuration, limit, sortBy, debouncedSearch, selectedTags]);

  const loadSegments = async (page: number = 1) => {
    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const pageSize = filters.limit || 100;
      const res = await api.listSegments(project.id, {
        page,
        pageSize: Math.min(pageSize, 500),
        sortBy: sortBy === 'time' ? 'startTime' : sortBy,
        sortOrder: 'desc',
        minScore: filters.minScore > 0 ? filters.minScore : undefined,
        minDuration: filters.minDuration > 0 ? filters.minDuration : undefined,
        maxDuration: filters.maxDuration < 600 ? filters.maxDuration : undefined,
        search: debouncedSearch || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
      
      const newSegments = res.data?.items || [];
      
      if (page === 1) {
        setSegments(newSegments);
      } else {
        setSegments(prev => [...prev, ...newSegments]);
      }
      
      setTotalFiltered(res.data?.total || 0);
      setHasMore(res.data?.hasMore || false);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load segments:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadSegments(currentPage + 1);
    }
  };

  // Apply client-side limit if set
  const displayedSegments = filters.limit 
    ? segments.slice(0, filters.limit)
    : segments;

  // Stats for legacy compatibility
  const stats = {
    total: segmentStats?.total ?? segments.length,
    monetizable: segmentStats?.monetizable ?? 0,
    highScore: segmentStats?.highScore ?? 0,
  };

  // Video controls
  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleSegmentSelect = useCallback((segment: Segment) => {
    setSelectedSegment(segment);
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
      setCurrentTime(segment.startTime);
    }
  }, []);

  const handleSegmentPlay = useCallback((segment: Segment) => {
    setSelectedSegment(segment);
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  // Keyboard navigation for segments
  useSegmentNavigation({
    segments: displayedSegments,
    selectedSegmentId: selectedSegment?.id || null,
    onSelect: handleSegmentSelect as (segment: any) => void,
    onPlay: handleSegmentPlay as (segment: any) => void,
    onEdit: (seg) => navigate(`/editor/${project.id}?segment=${seg.id}`),
    enabled: !showBatchExportModal,
  });

  // Toggle multi-select for a segment
  const toggleSegmentSelection = useCallback((segmentId: string, e?: React.MouseEvent) => {
    if (e?.shiftKey && selectedIds.length > 0) {
      // Range select
      const lastId = selectedIds[selectedIds.length - 1];
      const lastIndex = displayedSegments.findIndex(s => s.id === lastId);
      const currentIndex = displayedSegments.findIndex(s => s.id === segmentId);
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      const rangeIds = displayedSegments.slice(start, end + 1).map(s => s.id);
      setSelectedIds(prev => [...new Set([...prev, ...rangeIds])]);
    } else if (e?.ctrlKey || e?.metaKey) {
      // Toggle single
      setSelectedIds(prev => 
        prev.includes(segmentId) 
          ? prev.filter(id => id !== segmentId)
          : [...prev, segmentId]
      );
    } else {
      // Single select (in multi-select mode) or toggle
      if (multiSelectMode) {
        setSelectedIds(prev => 
          prev.includes(segmentId) 
            ? prev.filter(id => id !== segmentId)
            : [...prev, segmentId]
        );
      }
    }
  }, [displayedSegments, selectedIds, multiSelectMode]);

  const selectAllSegments = useCallback(() => {
    setSelectedIds(displayedSegments.map(s => s.id));
  }, [displayedSegments]);

  const deselectAllSegments = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // WORLD CLASS BATCH EXPORT - One click to export all high-scoring clips
  const handleBatchExport = async () => {
    setBatchExportLoading(true);
    setBatchExportProgress({ current: 0, total: stats.highScore, status: 'Démarrage...' });
    
    try {
      const response = await api.batchExportAll(project.id, {
        minScore: 70,
        maxClips: 500,
        style: 'viral_pro',
        platform: batchPlatform,
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: true,
        includeMetadata: true,
        useNvenc: true,
      });
      
      if (response.success && response.data?.jobId) {
        // Track progress via WebSocket or polling
        setBatchExportProgress({ 
          current: 0, 
          total: response.data.willExport || stats.highScore, 
          status: `Export de ${response.data.willExport} clips en cours...` 
        });
        
        // The job will send updates via WebSocket
        // For now, just show the modal
        setShowBatchExportModal(false);
      }
    } catch (error) {
      console.error('Batch export failed:', error);
      const detail = error instanceof Error ? error.message : 'Erreur inconnue.';
      setBatchExportProgress({
        current: 0,
        total: 0,
        status: `Export batch échoué : ${detail}`,
      });
    } finally {
      setBatchExportLoading(false);
    }
  };

  // Quick TikTok export for active segment (mirrors SegmentScoreCard "TikTok rapide")
  const triggerTikTokExport = useCallback(async (segment: Segment) => {
    try {
      await api.exportSegment(project.id, {
        segmentId: segment.id,
        platform: 'tiktok',
        includeCaptions: true,
        burnSubtitles: true,
        includeCover: true,
        includeMetadata: true,
      });
      useToastStore.getState().addToast({
        type: 'success',
        title: '🎵 TikTok en route',
        message: "Export lancé avec preset TikTok. Check l'onglet Export.",
      });
    } catch {
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Échec',
        message: "Impossible de lancer l'export.",
      });
    }
  }, [project.id]);

  // Keyboard shortcuts: j/k/e/space/enter + transport controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.matches('input, textarea, [contenteditable="true"], select')
      ) {
        return;
      }
      // Skip when a modal is open or multi-select dialog requires its own bindings
      if (showBatchExportModal) return;

      const currentIndex = displayedSegments.findIndex(
        (s) => s.id === selectedSegment?.id,
      );

      switch (e.key) {
        case 'j':
        case 'J':
        case 'ArrowDown': {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (displayedSegments.length === 0) return;
          e.preventDefault();
          const nextIdx = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, displayedSegments.length - 1);
          const next = displayedSegments[nextIdx];
          if (next) handleSegmentSelect(next);
          break;
        }
        case 'k':
        case 'K':
        case 'ArrowUp': {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (displayedSegments.length === 0) return;
          e.preventDefault();
          const prevIdx = currentIndex <= 0 ? 0 : currentIndex - 1;
          const prev = displayedSegments[prevIdx];
          if (prev) handleSegmentSelect(prev);
          break;
        }
        case 'e':
        case 'E': {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          e.preventDefault();
          if (selectedSegment) triggerTikTokExport(selectedSegment);
          break;
        }
        case 'Enter': {
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
          e.preventDefault();
          if (selectedSegment) {
            navigate(`/editor/${project.id}?segment=${selectedSegment.id}`);
          }
          break;
        }
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          handleSeek(Math.max(0, currentTime - (e.shiftKey ? 5 : 1)));
          break;
        case 'ArrowRight':
          handleSeek(currentTime + (e.shiftKey ? 5 : 1));
          break;
        case 'm':
        case 'M':
          setIsMuted((m) => !m);
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    currentTime,
    handlePlayPause,
    handleSeek,
    displayedSegments,
    selectedSegment,
    navigate,
    project.id,
    triggerTikTokExport,
    handleSegmentSelect,
    showBatchExportModal,
  ]);

  if (loading) {
    // Skeleton layout that mirrors the real 3-column view so there's no
    // layout shift when data arrives.
    return (
      <div className="h-full flex bg-[var(--bg-primary)]">
        <div className="w-80 border-r border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-7 w-7 rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <div className="h-6 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-28 w-full rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-4 w-full rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--bg-primary)]">
      {/* LEFT: Segment List */}
      <div className="w-80 flex flex-col border-r border-[var(--border-color)] bg-[var(--bg-card)]">
        {/* Header */}
        <div className="p-3 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Segments</h3>
            <div className="flex items-center gap-2">
              {/* Multi-select toggle */}
              <button
                onClick={() => {
                  setMultiSelectMode(!multiSelectMode);
                  if (multiSelectMode) setSelectedIds([]);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  multiSelectMode 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                }`}
                title={multiSelectMode ? 'Désactiver la sélection multiple' : 'Activer la sélection multiple'}
              >
                <Check className="w-4 h-4" />
              </button>
              
              {/* Export button - changes based on multi-select mode */}
              {multiSelectMode && selectedIds.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() => setShowBatchExportModal(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white text-xs px-2 py-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  {selectedIds.length}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowBatchExportModal(true)}
                  disabled={stats.highScore === 0}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs px-2 py-1"
                >
                  <Rocket className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Multi-select actions bar */}
          {multiSelectMode && (
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--text-muted)]">
                {selectedIds.length} sélectionné{selectedIds.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.length === 2 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      const a = segments.find((s) => s.id === selectedIds[0]);
                      const b = segments.find((s) => s.id === selectedIds[1]);
                      if (a && b) setComparing({ a, b });
                    }}
                  >
                    <Columns className="w-3.5 h-3.5 mr-1" />
                    Comparer A/B
                  </Button>
                )}
                <button
                  onClick={selectAllSegments}
                  className="text-blue-500 hover:text-blue-400"
                >
                  Tout
                </button>
                <button
                  onClick={deselectAllSegments}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Aucun
                </button>
              </div>
            </div>
          )}
          
          {/* Sort & View toggle */}
          <div className="flex items-center justify-between">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-secondary)]"
            >
              <option value="score">Par score</option>
              <option value="duration">Par durée</option>
              <option value="time">Chronologique</option>
            </select>
            
            <div className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
              <button
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-[var(--bg-card)] shadow-sm' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </button>
              <button
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-[var(--bg-card)] shadow-sm' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <LayoutList className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Filter Bar */}
        <SegmentFilterBar
          stats={segmentStats}
          filters={filters}
          onFiltersChange={setFilters}
          filteredCount={displayedSegments.length}
          loading={loading}
          availableTags={availableTags}
          onSearchChange={setSearch}
          onTagsChange={setSelectedTags}
          projectId={project.id}
        />

        {/* WORLD CLASS: Batch Export Modal */}
        <AnimatePresence>
          {showBatchExportModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
              onClick={() => !batchExportLoading && setShowBatchExportModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[var(--bg-card)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-[var(--border-color)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                      <Rocket className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)]">Export World Class</h3>
                      <p className="text-xs text-[var(--text-muted)]">One-click batch export</p>
                    </div>
                  </div>
                  {!batchExportLoading && (
                    <button
                      onClick={() => setShowBatchExportModal(false)}
                      className="p-1 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <X className="w-5 h-5 text-[var(--text-muted)]" />
                    </button>
                  )}
                </div>

                {/* Platform selector */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {([
                    { id: 'tiktok',         label: 'TikTok',     emoji: '🎵' },
                    { id: 'youtube_shorts', label: 'YT Shorts',  emoji: '▶️' },
                    { id: 'instagram',      label: 'Reels',      emoji: '📸' },
                    { id: 'twitter',        label: 'Twitter/X',  emoji: '𝕏' },
                  ] as const).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => !batchExportLoading && setBatchPlatform(p.id)}
                      disabled={batchExportLoading}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        batchPlatform === p.id
                          ? 'bg-amber-500/20 border border-amber-500 text-amber-300'
                          : 'bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-amber-500/50'
                      }`}
                    >
                      <span>{p.emoji}</span>{p.label}
                    </button>
                  ))}
                </div>

                <div className="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-secondary)]">Clips à exporter</span>
                    <span className="text-lg font-bold text-green-500">{Math.min(stats.highScore, 20)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-secondary)]">Seuil de score</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">≥ 70</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-secondary)]">Style</span>
                    <span className="text-sm font-medium text-amber-500">VIRAL PRO</span>
                  </div>
                </div>

                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Tous les clips seront exportés avec le style <strong className="text-amber-500">VIRAL PRO</strong> optimisé
                  pour <strong className="text-amber-400">{batchPlatform === 'tiktok' ? 'TikTok' : batchPlatform === 'youtube_shorts' ? 'YouTube Shorts' : batchPlatform === 'instagram' ? 'Instagram Reels' : 'Twitter/X'}</strong>, avec sous-titres, covers et metadata.
                </p>

                {batchExportProgress && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--text-muted)]">{batchExportProgress.status}</span>
                      <span className="text-[var(--text-primary)]">
                        {batchExportProgress.current}/{batchExportProgress.total}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchExportProgress.current / Math.max(1, batchExportProgress.total)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setShowBatchExportModal(false)}
                    disabled={batchExportLoading}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleBatchExport}
                    disabled={batchExportLoading || stats.highScore === 0}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                  >
                    {batchExportLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Export en cours...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4 mr-2" />
                        Lancer l'export
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Smart Suggestions */}
        {showSuggestions && suggestions.length > 0 && !multiSelectMode && (
          <div className="p-2 border-b border-[var(--border-color)] bg-gradient-to-br from-amber-500/5 to-orange-500/5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Suggestions
              </h4>
              <button
                onClick={() => setShowSuggestions(false)}
                className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              {suggestions.slice(0, 3).map(({ segment, reason }) => (
                <button
                  key={segment.id}
                  onClick={() => handleSegmentSelect(segment)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                    selectedSegment?.id === segment.id
                      ? 'bg-amber-500/20 ring-1 ring-amber-500'
                      : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
                    (segment.score?.total || 0) >= 70 ? 'bg-green-500' : 'bg-amber-500'
                  } text-white`}>
                    {segment.score?.total || 0}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {segment.topicLabel || 'Segment'}
                    </div>
                    <div className="text-[10px] text-amber-500">{reason}</div>
                  </div>
                  <Play className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Segment List */}
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {hasAutoSelected && selectedIds.length > 0 && (
            <div className="mb-2 p-2 bg-viral-medium/10 border border-viral-medium/20 rounded text-xs">
              ⚡ {selectedIds.length} segments auto-sélectionnés (score ≥70, 30-60s)
            </div>
          )}
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : displayedSegments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <Filter className="w-10 h-10 text-[var(--text-muted)] opacity-30 mb-3" />
              <p className="text-sm text-[var(--text-muted)]">Aucun segment trouvé</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Essayez d'ajuster les filtres</p>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid mode
            <div className="grid grid-cols-2 gap-2">
              {displayedSegments.map((segment) => (
                <SegmentCardCompact
                  key={segment.id}
                  segment={segment}
                  projectId={project.id}
                  isSelected={selectedSegment?.id === segment.id}
                  isChecked={selectedIds.includes(segment.id)}
                  showCheckbox={multiSelectMode}
                  onSelect={() => handleSegmentSelect(segment)}
                  onPlay={() => handleSegmentPlay(segment)}
                  onCheckToggle={(e) => toggleSegmentSelection(segment.id, e)}
                />
              ))}
            </div>
          ) : (
            // List mode
            <div className="space-y-1">
              {displayedSegments.map((segment) => (
                <SegmentRowCompact
                  key={segment.id}
                  segment={segment}
                  isSelected={selectedSegment?.id === segment.id}
                  onSelect={() => handleSegmentSelect(segment)}
                  onPlay={() => handleSegmentPlay(segment)}
                />
              ))}
            </div>
          )}
          
          {/* Load More Button */}
          {hasMore && !filters.limit && (
            <div className="mt-4 mb-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-2 px-4 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Charger plus ({totalFiltered - segments.length} restants)
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CENTER: Video Preview */}
      <SegmentPreview
        project={project}
        segments={segments}
        selectedSegment={selectedSegment}
        isPlaying={isPlaying}
        currentTime={currentTime}
        isMuted={isMuted}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onMuteToggle={() => setIsMuted(!isMuted)}
        onTimeUpdate={setCurrentTime}
        onEnded={() => setIsPlaying(false)}
        videoRef={videoRef}
      />

      {/* RIGHT: Segment Details + Actions */}
      <SegmentScoreCard
        segment={selectedSegment}
        projectId={project.id}
        onNavigateToEditor={(segmentId) => navigate(`/editor/${project.id}?segment=${segmentId}`)}
        onPlaySegment={handleSegmentPlay}
      />

      {/* A/B comparison overlay */}
      {comparing && (
        <SegmentComparisonModal
          projectId={project.id}
          segmentA={comparing.a as any}
          segmentB={comparing.b as any}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  );
}

// Components

function SegmentCardCompact({
  segment,
  projectId,
  isSelected,
  isChecked = false,
  showCheckbox = false,
  onSelect,
  onPlay,
  onCheckToggle,
}: {
  segment: Segment;
  projectId: string;
  isSelected: boolean;
  isChecked?: boolean;
  showCheckbox?: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onCheckToggle?: (e: React.MouseEvent) => void;
}) {
  const isMonetizable = segment.duration >= 60;
  const baseUrl = ENGINE_BASE_URL;
  
  return (
    <motion.div
      data-segment-id={segment.id}
      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : isChecked ? 'ring-2 ring-cyan-500' : 'hover:ring-1 hover:ring-[var(--border-color)]'
      }`}
      onClick={showCheckbox ? onCheckToggle : onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Checkbox overlay */}
      {showCheckbox && (
        <div 
          className={`absolute top-1 left-1 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isChecked 
              ? 'bg-cyan-500 border-cyan-500' 
              : 'bg-black/50 border-white/50 hover:border-white'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onCheckToggle?.(e);
          }}
        >
          {isChecked && <Check className="w-3 h-3 text-white" />}
        </div>
      )}
      
      {/* Thumbnail */}
      <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative">
        <img
          src={`${baseUrl}/v1/projects/${projectId}/thumbnail?time=${segment.startTime + 1}&width=160&height=90`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors group"
          onClick={(e) => {
            e.stopPropagation();
            if (!showCheckbox) onPlay();
          }}
        >
          {!showCheckbox && (
            <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-4 h-4 text-gray-900 ml-0.5" />
            </div>
          )}
        </button>
        
        {/* Duration badge */}
        <div className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-mono font-medium ${
          isMonetizable ? 'bg-green-500/90' : 'bg-amber-500/90'
        } text-white`}>
          {formatDurationShort(segment.duration)}
        </div>
        
        {/* Score badge */}
        <div className="absolute top-1 right-1">
          <ScoreBadge score={segment.score?.total} size="sm" />
        </div>
      </div>
      
      {/* Info */}
      <div className="p-2 bg-[var(--bg-secondary)]">
        <h4 className="text-xs font-medium text-[var(--text-primary)] truncate">
          {segment.topicLabel || 'Segment'}
        </h4>
        <p className="text-2xs text-[var(--text-muted)]">
          {formatTime(segment.startTime)}
        </p>
      </div>
    </motion.div>
  );
}

function SegmentRowCompact({
  segment,
  isSelected,
  onSelect,
  onPlay,
}: {
  segment: Segment;
  isSelected: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  return (
    <motion.div
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-500/10 border border-blue-500' : 'hover:bg-[var(--bg-secondary)]'
      }`}
      onClick={onSelect}
      layout
    >
      <ScoreBadge score={segment.score.total} size="sm" />
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-[var(--text-primary)] truncate">
          {segment.topicLabel || 'Segment'}
        </h4>
        <p className="text-xs text-[var(--text-muted)]">
          {formatTime(segment.startTime)} • {formatDurationShort(segment.duration)}
        </p>
      </div>
      
      <button
        className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        <Play className="w-4 h-4 text-[var(--text-secondary)]" />
      </button>
    </motion.div>
  );
}

function ScoreBadge({ score, size = 'md' }: { score: number | undefined | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = score ?? 0;
  const colors = s >= 70 ? 'bg-green-500' : s >= 50 ? 'bg-amber-500' : 'bg-gray-500';
  const sizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg',
  };
  
  return (
    <div className={`${sizes[size]} ${colors} rounded-lg flex items-center justify-center text-white font-bold`}>
      {Math.round(s)}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDurationShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
