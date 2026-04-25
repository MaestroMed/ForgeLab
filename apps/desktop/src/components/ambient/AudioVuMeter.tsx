import { useEffect, useState, useRef } from 'react';
import { useAppMode } from '@/lib/hooks/useAppMode';

/**
 * Ambient VU meter that reacts to the first actively-playing video on the page.
 * Shown as a thin bar at the top edge when audio is actually playing.
 * Skipped in Operator mode (dense / keyboard-first workflow).
 *
 * Implementation notes:
 *   - `createMediaElementSource` can only be called ONCE per media element,
 *     so if another part of the app has already wired the video up we fail
 *     silently in the try/catch.
 *   - We poll every 500ms for a new "actively playing" video, which is
 *     cheap and avoids mutation-observer complexity.
 */
export default function AudioVuMeter() {
  const { isOperator } = useAppMode();
  const [level, setLevel] = useState(0);
  const [active, setActive] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const findPlayingVideo = (): HTMLVideoElement | null => {
      const videos = document.querySelectorAll('video');
      for (const v of videos) {
        const el = v as HTMLVideoElement;
        if (!el.paused && !el.muted && el.volume > 0 && el.readyState >= 2) {
          return el;
        }
      }
      return null;
    };

    const detach = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        sourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
      } catch {
        // ignore — node may already be disconnected
      }
      sourceRef.current = null;
      analyserRef.current = null;
      currentVideoRef.current = null;
      setActive(false);
      setLevel(0);
    };

    const attach = (video: HTMLVideoElement) => {
      if (currentVideoRef.current === video) return;
      detach();

      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        const source = ctx.createMediaElementSource(video);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        sourceRef.current = source;
        analyserRef.current = analyser;
        currentVideoRef.current = video;
        setActive(true);

        const buf = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (const v of buf) sum += v;
          const avg = sum / buf.length / 255; // 0-1
          setLevel(avg);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        // Media element may already be wired to another source — can't re-wire.
        // Silently skip; the bar stays hidden.
      }
    };

    const check = () => {
      const playing = findPlayingVideo();
      if (playing) attach(playing);
      else if (currentVideoRef.current) detach();
    };

    // Poll for the active video every 500ms (cheap)
    check();
    const iv = setInterval(check, 500);

    return () => {
      clearInterval(iv);
      detach();
      try {
        audioCtxRef.current?.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    };
  }, []);

  if (!active || isOperator) return null;

  const width = Math.min(100, level * 300); // amplify

  return (
    <div className="fixed top-0 inset-x-0 h-[2px] z-[5] pointer-events-none overflow-hidden">
      <div
        className="h-full transition-[width] duration-[50ms] ease-out"
        style={{
          width: `${width}%`,
          background:
            'linear-gradient(90deg, transparent, #00D4FF, #F59E0B, #EF4444, transparent)',
          transformOrigin: 'center',
          boxShadow: `0 0 ${10 + level * 20}px rgba(0, 212, 255, ${0.3 + level * 0.7})`,
        }}
      />
    </div>
  );
}
