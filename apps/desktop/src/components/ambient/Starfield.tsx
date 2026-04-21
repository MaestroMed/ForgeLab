import { useEffect, useRef } from 'react';

interface Props {
  density?: number;        // 0-1 (default 0.6)
  speed?: number;          // 0-1 (default 0.3)
  color?: string;          // hex (default cyan glow)
  particleCount?: number;  // default 50
}

/**
 * Ambient starfield — a subtle, GPU-friendly canvas background that pauses
 * when the tab is hidden. Rendered as a fixed, pointer-events-none layer so
 * it sits behind app content without stealing clicks.
 *
 * Modern path: OffscreenCanvas + dedicated Web Worker — zero main-thread
 * cost, UI remains perfectly responsive even during heavy re-renders.
 *
 * Fallback: main-thread rendering kept lean (throttled to 30fps, DPR
 * capped at 1.5) for browsers/environments where OffscreenCanvas is
 * unavailable.
 */
export default function Starfield({
  density = 0.6,
  speed = 0.3,
  color = '#00D4FF',
  particleCount = 50,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const supportsOffscreen =
      typeof (canvas as HTMLCanvasElement & {
        transferControlToOffscreen?: () => OffscreenCanvas;
      }).transferControlToOffscreen === 'function' &&
      typeof Worker !== 'undefined';

    // === Modern path: OffscreenCanvas + Worker ===
    if (supportsOffscreen) {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const offscreen = (
          canvas as HTMLCanvasElement & {
            transferControlToOffscreen: () => OffscreenCanvas;
          }
        ).transferControlToOffscreen();

        const worker = new Worker(
          new URL('../../workers/starfieldWorker.ts', import.meta.url),
          { type: 'module' },
        );
        workerRef.current = worker;

        worker.postMessage(
          {
            type: 'init',
            canvas: offscreen,
            width: w,
            height: h,
            dpr,
            density,
            speed,
            color,
            particleCount,
          },
          [offscreen],
        );

        const onResize = () => {
          const nw = window.innerWidth;
          const nh = window.innerHeight;
          canvas.style.width = `${nw}px`;
          canvas.style.height = `${nh}px`;
          worker.postMessage({ type: 'resize', width: nw, height: nh, dpr });
        };
        window.addEventListener('resize', onResize);

        const onVis = () =>
          worker.postMessage({ type: document.hidden ? 'pause' : 'resume' });
        document.addEventListener('visibilitychange', onVis);

        return () => {
          window.removeEventListener('resize', onResize);
          document.removeEventListener('visibilitychange', onVis);
          worker.terminate();
          workerRef.current = null;
        };
      } catch (e) {
        // transferControlToOffscreen can only be called once per canvas,
        // and some environments may fail to spin up a module worker. Fall
        // through to the main-thread path on any failure.
        // eslint-disable-next-line no-console
        console.warn(
          '[Starfield] worker path failed, falling back to main thread',
          e,
        );
      }
    }

    // === Fallback: main-thread canvas rendering (lean, 30fps throttle) ===
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const applySize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    applySize();

    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: Math.random() * 1.8 + 0.2,
      opacity: Math.random() * density,
      twinkle: Math.random() * Math.PI * 2,
    }));

    let lastFrame = 0;
    const loop = (t: number) => {
      if (t - lastFrame < 33) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrame = t;

      ctx.clearRect(0, 0, width, height);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.twinkle += 0.04;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const tw = p.opacity * (0.5 + 0.5 * Math.sin(p.twinkle));
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => applySize();
    window.addEventListener('resize', onResize);

    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [density, speed, color, particleCount]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 gpu-layer"
      style={{ opacity: 0.5 }}
      aria-hidden="true"
    />
  );
}
