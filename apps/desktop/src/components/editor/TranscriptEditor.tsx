import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Check, X, Clock, Play, AlertTriangle, Save, Loader2 } from 'lucide-react';

interface Word {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface TranscriptEditorProps {
  words: Word[];
  currentTime: number;
  onWordUpdate: (index: number, word: string) => void;
  onTimingUpdate: (index: number, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onBulkUpdate?: (words: Word[]) => void; // For saving all changes at once
}

export function TranscriptEditor({
  words,
  currentTime,
  onWordUpdate,
  onTimingUpdate,
  onSeek,
  onBulkUpdate,
}: TranscriptEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingTiming, setEditingTiming] = useState<number | null>(null);
  const [timingValues, setTimingValues] = useState({ start: 0, end: 0 });
  const [pendingChanges, setPendingChanges] = useState<Map<number, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced auto-save
  useEffect(() => {
    if (pendingChanges.size > 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        handleAutoSave();
      }, 2000); // Auto-save after 2 seconds of inactivity
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pendingChanges]);

  const handleAutoSave = async () => {
    if (pendingChanges.size === 0) return;
    
    setIsSaving(true);
    
    // Apply all pending changes
    pendingChanges.forEach((newWord, index) => {
      onWordUpdate(index, newWord);
    });
    
    // If bulk update is available, use it
    if (onBulkUpdate) {
      const updatedWords = words.map((w, i) => 
        pendingChanges.has(i) ? { ...w, word: pendingChanges.get(i)! } : w
      );
      onBulkUpdate(updatedWords);
    }
    
    setPendingChanges(new Map());
    setLastSaved(new Date());
    setIsSaving(false);
  };

  // Auto-scroll to current word
  useEffect(() => {
    if (!containerRef.current || editingIndex !== null) return;
    const currentWordIndex = words.findIndex(
      (w) => currentTime >= w.start && currentTime < w.end
    );
    if (currentWordIndex >= 0) {
      const wordEl = containerRef.current.querySelector(`[data-word-index="${currentWordIndex}"]`);
      if (wordEl) {
        wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, words, editingIndex]);

  const handleStartEdit = (index: number) => {
    // Save any pending edit first
    if (editingIndex !== null && editValue !== words[editingIndex].word) {
      setPendingChanges(new Map(pendingChanges.set(editingIndex, editValue)));
    }
    
    setEditingIndex(index);
    // Check if there's a pending change for this word
    setEditValue(pendingChanges.get(index) || words[index].word);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null) {
      if (editValue !== words[editingIndex].word) {
        setPendingChanges(new Map(pendingChanges.set(editingIndex, editValue)));
      }
      setEditingIndex(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const handleStartTimingEdit = (index: number) => {
    setEditingTiming(index);
    setTimingValues({ start: words[index].start, end: words[index].end });
  };

  const handleSaveTiming = () => {
    if (editingTiming !== null) {
      onTimingUpdate(editingTiming, timingValues.start, timingValues.end);
      setEditingTiming(null);
    }
  };

  // Navigate with keyboard
  const handleKeyNavigation = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
      if (index < words.length - 1) {
        handleStartEdit(index + 1);
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
      if (index > 0) {
        handleStartEdit(index - 1);
      }
    }
  }, [editingIndex, words.length]);

  const isCurrentWord = useCallback(
    (word: Word) => currentTime >= word.start && currentTime < word.end,
    [currentTime]
  );

  const isLowConfidence = (word: Word) => (word.confidence || 1) < 0.7;
  
  const hasPendingChange = (index: number) => pendingChanges.has(index);

  // Group words into lines (every 8-10 words)
  const wordLines = useMemo(() => {
    const lines: Word[][] = [];
    const wordsPerLine = 10;
    for (let i = 0; i < words.length; i += wordsPerLine) {
      lines.push(words.slice(i, i + wordsPerLine));
    }
    return lines;
  }, [words]);

  return (
    <div className="h-full flex flex-col bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">Éditeur de transcription</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {words.length} mots • {pendingChanges.size > 0 && (
              <span className="text-amber-400">{pendingChanges.size} modification(s) non sauvegardée(s)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Save status */}
          <div className="flex items-center gap-2 text-xs">
            {isSaving ? (
              <span className="flex items-center gap-1 text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Sauvegarde...
              </span>
            ) : pendingChanges.size > 0 ? (
              <button
                onClick={handleAutoSave}
                className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
              >
                <Save className="w-3 h-3" />
                Sauvegarder ({pendingChanges.size})
              </button>
            ) : lastSaved ? (
              <span className="flex items-center gap-1 text-green-400">
                <Check className="w-3 h-3" />
                Sauvegardé
              </span>
            ) : null}
          </div>
          
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" /> Actuel
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" /> Confiance faible
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" /> Modifié
            </span>
          </div>
        </div>
      </div>

      {/* Words display - line by line for better readability */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {wordLines.map((lineWords, lineIndex) => {
            const lineStartIndex = lineIndex * 10;
            const lineStartTime = lineWords[0]?.start || 0;
            
            return (
              <div key={lineIndex} className="flex items-start gap-2">
                {/* Timestamp indicator */}
                <button
                  onClick={() => onSeek(lineStartTime)}
                  className="flex-shrink-0 w-14 text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-secondary)] rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)] transition-colors"
                  title="Aller à ce moment"
                >
                  {formatTime(lineStartTime)}
                </button>
                
                {/* Words in this line */}
                <div className="flex flex-wrap gap-1 flex-1">
                  {lineWords.map((word, wordIndex) => {
                    const index = lineStartIndex + wordIndex;
                    const isCurrent = isCurrentWord(word);
                    const isLow = isLowConfidence(word);
                    const isEditing = editingIndex === index;
                    const isEditingTime = editingTiming === index;
                    const hasChange = hasPendingChange(index);
                    const displayWord = hasChange ? pendingChanges.get(index)! : word.word;

                    return (
                      <motion.div
                        key={index}
                        data-word-index={index}
                        className={`relative group ${isCurrent ? 'z-10' : ''}`}
                        layout
                        initial={false}
                        animate={{
                          scale: isCurrent ? 1.05 : 1,
                        }}
                        transition={{ duration: 0.15 }}
                      >
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="flex items-center gap-1 bg-blue-500/20 border border-blue-500 rounded-lg p-1"
                            >
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit();
                                  if (e.key === 'Escape') handleCancelEdit();
                                  handleKeyNavigation(e, index);
                                }}
                                className="bg-transparent border-none outline-none text-sm w-24 text-[var(--text-primary)]"
                                autoFocus
                              />
                              <button onClick={handleSaveEdit} className="p-1 hover:bg-green-500/20 rounded">
                                <Check className="w-3 h-3 text-green-500" />
                              </button>
                              <button onClick={handleCancelEdit} className="p-1 hover:bg-red-500/20 rounded">
                                <X className="w-3 h-3 text-red-500" />
                              </button>
                            </motion.div>
                          ) : isEditingTime ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="flex flex-col gap-1 bg-purple-500/20 border border-purple-500 rounded-lg p-2"
                            >
                              <span className="text-xs font-medium text-[var(--text-primary)]">{displayWord}</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={timingValues.start.toFixed(2)}
                                  onChange={(e) => setTimingValues({ ...timingValues, start: parseFloat(e.target.value) })}
                                  className="w-16 bg-transparent border border-white/20 rounded px-1 text-xs text-[var(--text-primary)]"
                                />
                                <span className="text-xs text-[var(--text-muted)]">→</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={timingValues.end.toFixed(2)}
                                  onChange={(e) => setTimingValues({ ...timingValues, end: parseFloat(e.target.value) })}
                                  className="w-16 bg-transparent border border-white/20 rounded px-1 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                              <div className="flex gap-1">
                                <button onClick={handleSaveTiming} className="flex-1 p-1 bg-purple-500 rounded text-xs text-white">
                                  OK
                                </button>
                                <button onClick={() => setEditingTiming(null)} className="flex-1 p-1 bg-white/10 rounded text-xs">
                                  ✕
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.button
                              onClick={() => onSeek(word.start)}
                              onDoubleClick={() => handleStartEdit(index)}
                              className={`
                                px-2 py-1 rounded-lg text-sm transition-all cursor-pointer relative
                                ${isCurrent 
                                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                                  : hasChange
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : isLow 
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                }
                              `}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              {displayWord}
                              
                              {/* Hover actions */}
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-1 shadow-lg z-20">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(index);
                                  }}
                                  className="p-1 hover:bg-blue-500/20 rounded"
                                  title="Éditer le mot (double-clic)"
                                >
                                  <Edit2 className="w-3 h-3 text-blue-400" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartTimingEdit(index);
                                  }}
                                  className="p-1 hover:bg-purple-500/20 rounded"
                                  title="Ajuster le timing"
                                >
                                  <Clock className="w-3 h-3 text-purple-400" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSeek(word.start);
                                  }}
                                  className="p-1 hover:bg-green-500/20 rounded"
                                  title="Aller à ce mot"
                                >
                                  <Play className="w-3 h-3 text-green-400" />
                                </button>
                              </div>
                              
                              {/* Low confidence indicator */}
                              {isLow && !hasChange && (
                                <AlertTriangle className="absolute -top-1 -right-1 w-3 h-3 text-amber-500" />
                              )}
                              
                              {/* Modified indicator */}
                              {hasChange && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                              )}
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with tips */}
      <div className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            💡 <strong>Double-clic</strong> pour éditer • <strong>Tab</strong> mot suivant • <strong>Échap</strong> annuler
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Sauvegarde automatique après 2s d'inactivité
          </p>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default TranscriptEditor;
