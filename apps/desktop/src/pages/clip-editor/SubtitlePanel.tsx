import { useState, useEffect, useRef, useCallback } from 'react';
import { Type, Check } from 'lucide-react';
import { useToastStore } from '@/store';
import { api } from '@/lib/api';
import { WordTiming } from '@/components/editor/KaraokeSubtitles';

interface SubtitlePanelProps {
  style: any;
  presetName: string;
  onStyleChange: (updates: any) => void;
  onApplyPreset: (preset: string) => void;
  wordTimings?: WordTiming[];
  transcript?: string;
  projectId?: string;
  segmentId?: string;
}

export function SubtitlePanel({
  style,
  presetName: _presetName,
  onStyleChange,
  onApplyPreset: _onApplyPreset,
  wordTimings = [],
  transcript = '',
  projectId = '',
  segmentId = '',
}: SubtitlePanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedWords, setEditedWords] = useState<string[]>([]);
  const [originalWords, setOriginalWords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [initializedSegmentId, setInitializedSegmentId] = useState<string | null>(null);
  const [, setFocusedWordIndex] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { addToast } = useToastStore();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if word is modified compared to original
  const isWordModified = useCallback((index: number) => {
    return originalWords[index] !== editedWords[index];
  }, [originalWords, editedWords]);

  // Count modified words
  const modifiedCount = editedWords.filter((w, i) => originalWords[i] !== w).length;

  // Initialize edited words ONLY when segment changes (not on every render)
  useEffect(() => {
    // Only reinitialize when we have a NEW segment
    if (segmentId && segmentId !== initializedSegmentId) {
      const words = wordTimings.length > 0
        ? wordTimings.map(w => w.word)
        : transcript ? transcript.split(/\s+/).filter(Boolean) : [];

      setEditedWords(words);
      setOriginalWords(words); // Keep track of original for diff
      setInitializedSegmentId(segmentId);
      setIsEditing(false); // Reset editing state on segment change
    }
  }, [segmentId, wordTimings, transcript, initializedSegmentId]);

  const handleWordChange = (index: number, newWord: string) => {
    const updated = [...editedWords];
    updated[index] = newWord;
    setEditedWords(updated);
    setHasUnsavedChanges(true);

    // Auto-save with debounce (1.5s after last change)
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave(updated);
    }, 1500);
  };

  // Auto-save function (silent save)
  const handleAutoSave = async (words: string[]) => {
    if (!projectId || !segmentId || !hasUnsavedChanges) return;

    try {
      const updatedTimings = wordTimings.length > 0
        ? wordTimings.map((w, i) => ({
            ...w,
            word: words[i] || w.word,
          }))
        : words.map((word) => ({
            word,
            start: 0,
            end: 0,
          }));

      await api.updateTranscript(projectId, segmentId, {
        words: updatedTimings,
        text: words.join(' '),
      });

      setOriginalWords([...words]);
      setHasUnsavedChanges(false);

      // Silent toast - just a quick indicator
      addToast({
        type: 'success',
        title: '✓ Sauvegardé',
        message: '',
      });
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIndex = e.shiftKey ? index - 1 : index + 1;
      if (nextIndex >= 0 && nextIndex < editedWords.length) {
        inputRefs.current[nextIndex]?.focus();
        setFocusedWordIndex(nextIndex);
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Move to next word on Enter
      const nextIndex = index + 1;
      if (nextIndex < editedWords.length) {
        inputRefs.current[nextIndex]?.focus();
        setFocusedWordIndex(nextIndex);
      }
    }
  };

  // Reset single word to original
  const resetWord = (index: number) => {
    if (originalWords[index]) {
      const updated = [...editedWords];
      updated[index] = originalWords[index];
      setEditedWords(updated);
    }
  };

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!projectId || !segmentId) {
      console.error('[SubtitlePanel] Missing projectId or segmentId', { projectId, segmentId });
      addToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de sauvegarder : segment non sélectionné',
      });
      return;
    }
    setSaving(true);
    try {
      // Build updated word timings (if we have original timings)
      const updatedTimings = wordTimings.length > 0
        ? wordTimings.map((w, i) => ({
            ...w,
            word: editedWords[i] || w.word,
          }))
        : editedWords.map((word, _i) => ({
            word,
            start: 0,
            end: 0,
          }));

      // Save to backend
      await api.updateTranscript(projectId, segmentId, {
        words: updatedTimings,
        text: editedWords.join(' '),
      });

      addToast({
        type: 'success',
        title: 'Transcription sauvegardée',
        message: 'Les corrections ont été enregistrées',
      });
      setOriginalWords([...editedWords]); // Update original after successful save
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save transcript:', err);
      addToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de sauvegarder les corrections',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Style Preview Card */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-900 to-black border border-white/10 p-6">
        <div className="text-center">
          {/* Preview of the subtitle style */}
          <div className="inline-block">
            <span
              className="text-white font-bold uppercase tracking-wide"
              style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: '24px',
                textShadow: '0 0 8px rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.9)',
                WebkitTextStroke: '1px black',
              }}
            >
              CECI EST{' '}
              <span
                className="text-yellow-400"
                style={{
                  transform: 'scale(1.1)',
                  display: 'inline-block',
                }}
              >
                UN TEST
              </span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Police Anton • MAJUSCULES • Jaune/Blanc
          </p>
        </div>

        {/* Badge */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
          <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">World Class</span>
        </div>
      </div>

      {/* Transcript Editor */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <Type className="w-4 h-4" />
              Transcription
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {editedWords.length} mots • Clique pour corriger
            </p>
          </div>
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                {saving ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Sauver
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
            >
              ✏️ Éditer
            </button>
          )}
        </div>

        {/* Words display/edit */}
        <div className="max-h-48 overflow-y-auto bg-black/30 rounded-lg p-3">
          {editedWords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {editedWords.map((word, index) => (
                isEditing ? (
                  <div key={index} className="relative group">
                    <input
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      value={word}
                      onChange={(e) => handleWordChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      onFocus={() => setFocusedWordIndex(index)}
                      className={`px-2 py-1 rounded text-sm text-white focus:outline-none min-w-[40px] transition-all ${
                        isWordModified(index)
                          ? 'bg-yellow-500/20 border-2 border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                          : 'bg-white/10 border border-white/20 focus:border-blue-500'
                      }`}
                      style={{ width: `${Math.max(50, word.length * 9 + 16)}px` }}
                      title={isWordModified(index) ? `Original: "${originalWords[index]}"` : undefined}
                    />
                    {/* Reset button for modified words */}
                    {isWordModified(index) && (
                      <button
                        onClick={() => resetWord(index)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Restaurer l'original"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <span
                    key={index}
                    onClick={() => {
                      setIsEditing(true);
                      setFocusedWordIndex(index);
                      // Focus the input after state update
                      setTimeout(() => inputRefs.current[index]?.focus(), 50);
                    }}
                    className={`px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                      isWordModified(index)
                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    {word}
                  </span>
                )
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune transcription disponible
            </p>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-[10px] mt-2">
          <span className="text-gray-500">
            {isEditing ? (
              <>💡 Tab pour naviguer • Entrée pour suivant • Échap pour fermer</>
            ) : (
              <>Clique sur un mot pour le corriger</>
            )}
          </span>
          {modifiedCount > 0 && (
            <span className="text-yellow-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              {modifiedCount} modif{modifiedCount > 1 ? 's' : ''}
              {hasUnsavedChanges && ' • Sauvegarde auto...'}
            </span>
          )}
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
        <div>
          <h4 className="text-sm font-medium text-white">Sous-titres</h4>
          <p className="text-xs text-gray-500 mt-0.5">Effet karaoké mot par mot</p>
        </div>
        <button
          onClick={() => onStyleChange({ enabled: !style.enabled })}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            style.enabled !== false ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              style.enabled !== false ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Position Y - THE MAIN CONTROL */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-white">Position verticale</label>
          <span className="text-xs text-yellow-400 font-mono">{style.positionY ?? 960}px</span>
        </div>

        {/* Visual position indicator */}
        <div className="relative h-32 bg-black/50 rounded-lg mb-3 overflow-hidden">
          {/* 9:16 preview container */}
          <div className="absolute inset-2 border border-white/20 rounded flex flex-col">
            {/* Facecam zone indicator */}
            <div className="h-[40%] border-b border-white/10 flex items-center justify-center">
              <span className="text-[10px] text-gray-500">Facecam</span>
            </div>
            {/* Content zone indicator */}
            <div className="flex-1 relative">
              <span className="absolute top-2 left-2 text-[10px] text-gray-500">Content</span>
              {/* Subtitle position indicator */}
              <div
                className="absolute left-0 right-0 h-4 bg-yellow-500/30 border-y border-yellow-500/50 flex items-center justify-center transition-all"
                style={{
                  top: `${((style.positionY ?? 960) / 1920) * 100}%`,
                  transform: 'translateY(-50%)',
                }}
              >
                <span className="text-[8px] text-yellow-400 font-bold">SOUS-TITRES</span>
              </div>
            </div>
          </div>
        </div>

        {/* Slider */}
        <input
          type="range"
          min="200"
          max="1700"
          step="10"
          value={style.positionY ?? 960}
          onChange={(e) => onStyleChange({ positionY: Number(e.target.value) })}
          className="w-full accent-yellow-500"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>↑ Haut (200)</span>
          <span>Milieu (960)</span>
          <span>Bas (1700) ↓</span>
        </div>

        {/* Quick position buttons */}
        <div className="flex gap-2 mt-3">
          {[
            { label: 'Haut', value: 350 },
            { label: 'Centre', value: 960 },
            { label: 'Bas', value: 1500 },
          ].map((pos) => (
            <button
              key={pos.label}
              onClick={() => onStyleChange({ positionY: pos.value })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                Math.abs((style.positionY ?? 960) - pos.value) < 100
                  ? 'bg-yellow-500 text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size (optional tweak) */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-white">Taille</label>
          <span className="text-xs text-gray-400 font-mono">{style.fontSize || 96}px</span>
        </div>
        <input
          type="range"
          min="60"
          max="140"
          value={style.fontSize || 96}
          onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
          className="w-full accent-yellow-500"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>Petit</span>
          <span>Normal (96)</span>
          <span>Grand</span>
        </div>
      </div>

      {/* Words per line */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-white">Mots par ligne</label>
          <span className="text-xs text-gray-400 font-mono">{style.wordsPerLine || 4}</span>
        </div>
        <input
          type="range"
          min="2"
          max="6"
          value={style.wordsPerLine || 4}
          onChange={(e) => onStyleChange({ wordsPerLine: Number(e.target.value) })}
          className="w-full accent-yellow-500"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>2 (Viral)</span>
          <span>4 (Optimal)</span>
          <span>6 (Dense)</span>
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
        <p className="text-xs text-yellow-400/80">
          <strong>Style World Class :</strong> Police Anton, MAJUSCULES, effet karaoké jaune/blanc.
          Le mot actif s'illumine en jaune quand il est prononcé.
        </p>
      </div>
    </div>
  );
}
