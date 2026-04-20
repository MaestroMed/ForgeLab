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
 * Perf notes: uses native canvas shadowBlur for the glow (no per-particle
 * gradient allocation), throttles to 30fps since it's purely ambient, and
 * caps DPR scaling at 1.5 to keep fill cost sane on hi-DPI displays.
 */
export default function Starfield({
  density = 0.6,
  speed = 0.3,
  color = '#00D4FF',
  particleCount = 50,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const particlesRef = useRef<Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; opacity: number; twinkle: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cap DPR at 1.5 — above that the fill cost rises with little visual gain
    // on an ambient layer that's already rendered at 50% opacity.
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
      // Reset transform before scaling to avoid cumulative scale across resizes.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    applySize();

    // Init particles
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: Math.random() * 1.8 + 0.2,
      opacity: Math.random() * density,
      twinkle: Math.random() * Math.PI * 2,
    }));

    const onResize = () => applySize();
    window.addEventListener('resize', onResize);

    const loop = (t: number) => {
      // Throttle to ~30fps — ambient movement doesn't need full 60.
      const dt = t - lastFrameRef.current;
      if (dt < 33) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameRef.current = t;

      ctx.clearRect(0, 0, width, height);

      // One-time setup per frame: shadowBlur provides the glow so we don't
      // have to allocate a radial gradient per particle.
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.twinkle += 0.04;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const twinkleOpacity = p.opacity * (0.5 + 0.5 * Math.sin(p.twinkle));

        ctx.globalAlpha = twinkleOpacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Restore defaults so we don't leak state if the canvas is reused.
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [density, speed, color, particleCount]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.5 }}
      aria-hidden="true"
    />
  );
}
