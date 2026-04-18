import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubtitleStyleStore } from '@/store';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface KaraokeSubtitlesProps {
  words: WordTiming[];
  currentTime: number;
  clipStartTime: number;
}

/**
 * WORLD CLASS Karaoke Subtitles Component
 * 
 * Features:
 * - Anton font (bold condensed)
 * - UPPERCASE text
 * - Yellow highlight for active word
 * - White for other words
 * - Respects positionY from style store
 */
export function KaraokeSubtitles({ words, currentTime, clipStartTime }: KaraokeSubtitlesProps) {
  const { style } = useSubtitleStyleStore();
  
  // Get relative time within clip
  const relativeTime = currentTime - clipStartTime;
  
  // Max words per line (from style or default 4)
  const maxWordsPerLine = style.wordsPerLine || 4;
  
  // Find visible words (current chunk based on maxWordsPerLine)
  const visibleWords = useMemo(() => {
    if (!words.length) return [];
    
    // Find current word index
    const currentIndex = words.findIndex(
      (w) => relativeTime >= w.start && relativeTime < w.end
    );
    
    if (currentIndex === -1) {
      // Before first word or after last word
      const firstWord = words[0];
      if (relativeTime < firstWord.start) {
        return words.slice(0, Math.min(maxWordsPerLine, words.length)).map((w, i) => ({
          ...w,
          isCurrent: false,
          isPast: false,
          index: i,
        }));
      }
      return [];
    }
    
    // Calculate which chunk we're in
    const chunkIndex = Math.floor(currentIndex / maxWordsPerLine);
    const start = chunkIndex * maxWordsPerLine;
    const end = Math.min(words.length, start + maxWordsPerLine);
    
    return words.slice(start, end).map((w, i) => ({
      ...w,
      isCurrent: start + i === currentIndex,
      isPast: start + i < currentIndex,
      index: start + i,
    }));
  }, [words, relativeTime, maxWordsPerLine]);

  // Position style - use positionY if set, otherwise fallback to position preset
  const getPositionStyle = (): React.CSSProperties => {
    // positionY is in pixels (0-1920 for full 9:16)
    // In the preview (9:16 scaled down), we need to convert to percentage
    if (style.positionY !== undefined && style.positionY > 0) {
      // Convert to percentage of height
      const percentY = (style.positionY / 1920) * 100;
      return {
        position: 'absolute',
        left: '4%',
        right: '4%',
        top: `${percentY}%`,
        transform: 'translateY(-50%)',
      };
    }
    
    // Fallback to position preset
    switch (style.position) {
      case 'top':
        return {
          position: 'absolute',
          left: '4%',
          right: '4%',
          top: '8%',
        };
      case 'center':
        return {
          position: 'absolute',
          left: '4%',
          right: '4%',
          top: '50%',
          transform: 'translateY(-50%)',
        };
      case 'bottom':
      default:
        return {
          position: 'absolute',
          left: '4%',
          right: '4%',
          bottom: '8%',
        };
    }
  };

  // Don't render if no words or disabled
  if (!visibleWords.length || style.enabled === false) return null;

  // Scale font for preview (preview is ~640px vs 1920px output = ~3x scale down)
  const scaledFontSize = (style.fontSize || 96) / 2.8;

  return (
    <div 
      className="text-center z-20 pointer-events-none"
      style={getPositionStyle()}
    >
      <motion.div
        className="inline-flex flex-wrap justify-center items-baseline gap-x-2 gap-y-1 px-4 py-3 rounded-xl"
        style={{
          maxWidth: '95%',
        }}
        layout
      >
        <AnimatePresence mode="popLayout">
          {visibleWords.map((wordData) => {
            const { word, isCurrent, isPast, index } = wordData as any;
            
            // WORLD CLASS style: UPPERCASE
            const displayWord = word.toUpperCase();
            
            // Colors: Yellow for active, White for others
            const wordColor = isCurrent ? '#FFFF00' : '#FFFFFF';
            
            // Scale effect for current word
            const scale = isCurrent ? 1.1 : 1;
            
            // Opacity for non-active words
            const opacity = isCurrent ? 1 : (isPast ? 0.9 : 0.7);
            
            // Text shadow for outline effect (thick black outline)
            const outlineWidth = 3; // Scaled for preview
            const textShadow = `
              -${outlineWidth}px -${outlineWidth}px 0 #000,
              ${outlineWidth}px -${outlineWidth}px 0 #000,
              -${outlineWidth}px ${outlineWidth}px 0 #000,
              ${outlineWidth}px ${outlineWidth}px 0 #000,
              0 ${outlineWidth + 2}px 4px rgba(0,0,0,0.5)
            `;

            return (
              <motion.span
                key={`${index}-${word}`}
                className="inline-block"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ 
                  opacity, 
                  scale,
                  color: wordColor,
                }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30,
                  duration: 0.1,
                }}
                style={{
                  fontFamily: 'Anton, Impact, sans-serif',
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: 700,
                  color: wordColor,
                  textShadow,
                  lineHeight: 1.2,
                  letterSpacing: '0.02em',
                }}
              >
                {displayWord}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Helper to parse transcript into word timings (if not provided by backend)
export function parseTranscriptToWords(transcript: string, duration: number): WordTiming[] {
  const words = transcript.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  
  const avgWordDuration = duration / words.length;
  
  return words.map((word, i) => ({
    word,
    start: i * avgWordDuration,
    end: (i + 1) * avgWordDuration,
    confidence: 1,
  }));
}

export default KaraokeSubtitles;
