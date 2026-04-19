import { useEffect } from 'react';

const VIDEO_URL_PATTERNS = [
  /youtube\.com\/watch\?v=/i,
  /youtu\.be\//i,
  /twitch\.tv\/videos\//i,
  /twitch\.tv\/\w+\/clip\//i,
  /tiktok\.com\/@[\w.-]+\/video\//i,
  /vimeo\.com\/\d+/i,
];

export function useUrlPasteDetector(onDetect: (url: string) => void) {
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger if the user is pasting into an input/textarea
      if (target && typeof target.matches === 'function' && target.matches('input, textarea, [contenteditable]')) return;

      const text = e.clipboardData?.getData('text') ?? '';
      const trimmed = text.trim();

      if (!trimmed || trimmed.length > 500) return;

      // Check if it looks like a video URL
      if (VIDEO_URL_PATTERNS.some((p) => p.test(trimmed))) {
        e.preventDefault();
        onDetect(trimmed);
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [onDetect]);
}
