import { useEffect, useCallback, useRef } from 'react';

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  [key: string]: any;
}

interface UseSegmentNavigationOptions {
  segments: Segment[];
  selectedSegmentId: string | null;
  onSelect: (segment: Segment) => void;
  onPlay?: (segment: Segment) => void;
  onEdit?: (segment: Segment) => void;
  onExport?: (segment: Segment) => void;
  enabled?: boolean;
}

/**
 * Hook for keyboard navigation through segments.
 * 
 * Shortcuts:
 * - ArrowUp/ArrowDown: Navigate through segments
 * - Space: Play/pause selected segment
 * - Enter: Open in editor
 * - E: Quick export
 * - Home: Jump to first segment
 * - End: Jump to last segment
 */
export function useSegmentNavigation({
  segments,
  selectedSegmentId,
  onSelect,
  onPlay,
  onEdit,
  onExport,
  enabled = true,
}: UseSegmentNavigationOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const getCurrentIndex = useCallback(() => {
    if (!selectedSegmentId || segments.length === 0) return -1;
    return segments.findIndex(s => s.id === selectedSegmentId);
  }, [segments, selectedSegmentId]);

  const selectByIndex = useCallback((index: number) => {
    if (index >= 0 && index < segments.length) {
      onSelect(segments[index]);
      
      // Scroll into view if in a scrollable container
      const element = document.querySelector(`[data-segment-id="${segments[index].id}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [segments, onSelect]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const currentIndex = getCurrentIndex();

    switch (e.key) {
      case 'ArrowUp':
      case 'k': // Vim-style navigation
        e.preventDefault();
        if (currentIndex > 0) {
          selectByIndex(currentIndex - 1);
        } else if (currentIndex === -1 && segments.length > 0) {
          selectByIndex(0);
        }
        break;

      case 'ArrowDown':
      case 'j': // Vim-style navigation
        e.preventDefault();
        if (currentIndex < segments.length - 1) {
          selectByIndex(currentIndex + 1);
        } else if (currentIndex === -1 && segments.length > 0) {
          selectByIndex(0);
        }
        break;

      case 'Home':
        e.preventDefault();
        if (segments.length > 0) {
          selectByIndex(0);
        }
        break;

      case 'End':
        e.preventDefault();
        if (segments.length > 0) {
          selectByIndex(segments.length - 1);
        }
        break;

      case ' ': // Space
        if (selectedSegmentId && onPlay) {
          e.preventDefault();
          const segment = segments.find(s => s.id === selectedSegmentId);
          if (segment) {
            onPlay(segment);
          }
        }
        break;

      case 'Enter':
        if (selectedSegmentId && onEdit) {
          e.preventDefault();
          const segment = segments.find(s => s.id === selectedSegmentId);
          if (segment) {
            onEdit(segment);
          }
        }
        break;

      case 'e':
      case 'E':
        if (selectedSegmentId && onExport) {
          e.preventDefault();
          const segment = segments.find(s => s.id === selectedSegmentId);
          if (segment) {
            onExport(segment);
          }
        }
        break;

      // Page up/down for faster navigation
      case 'PageUp':
        e.preventDefault();
        selectByIndex(Math.max(0, currentIndex - 5));
        break;

      case 'PageDown':
        e.preventDefault();
        selectByIndex(Math.min(segments.length - 1, currentIndex + 5));
        break;
    }
  }, [enabled, getCurrentIndex, selectByIndex, selectedSegmentId, segments, onPlay, onEdit, onExport]);

  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    containerRef,
    currentIndex: getCurrentIndex(),
  };
}

// Multi-select support
interface UseMultiSelectOptions {
  segments: Segment[];
  enabled?: boolean;
}

interface MultiSelectState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
}

export function useMultiSelect({
  segments,
  enabled: _enabled = true,
}: UseMultiSelectOptions) {
  const stateRef = useRef<MultiSelectState>({
    selectedIds: new Set(),
    lastSelectedId: null,
  });

  const toggleSelect = useCallback((segmentId: string, shiftKey = false, ctrlKey = false) => {
    const state = stateRef.current;
    const newSelected = new Set(state.selectedIds);

    if (shiftKey && state.lastSelectedId) {
      // Range select
      const lastIndex = segments.findIndex(s => s.id === state.lastSelectedId);
      const currentIndex = segments.findIndex(s => s.id === segmentId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        
        for (let i = start; i <= end; i++) {
          newSelected.add(segments[i].id);
        }
      }
    } else if (ctrlKey) {
      // Toggle single
      if (newSelected.has(segmentId)) {
        newSelected.delete(segmentId);
      } else {
        newSelected.add(segmentId);
      }
    } else {
      // Single select (replace)
      newSelected.clear();
      newSelected.add(segmentId);
    }

    state.selectedIds = newSelected;
    state.lastSelectedId = segmentId;

    return Array.from(newSelected);
  }, [segments]);

  const selectAll = useCallback(() => {
    stateRef.current.selectedIds = new Set(segments.map(s => s.id));
    return segments.map(s => s.id);
  }, [segments]);

  const deselectAll = useCallback(() => {
    stateRef.current.selectedIds = new Set();
    return [];
  }, []);

  const isSelected = useCallback((segmentId: string) => {
    return stateRef.current.selectedIds.has(segmentId);
  }, []);

  return {
    toggleSelect,
    selectAll,
    deselectAll,
    isSelected,
    getSelectedIds: () => Array.from(stateRef.current.selectedIds),
  };
}
