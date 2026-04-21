/// <reference lib="WebWorker" />
declare const self: DedicatedWorkerGlobalScope;

/**
 * OffscreenCanvas-powered starfield worker.
 *
 * Runs entirely off the main thread. The main-thread component transfers
 * canvas ownership via `transferControlToOffscreen()` and sends an `init`
 * message with the desired dimensions, config, and DPR. This worker then
 * owns the canvas and drives a throttled 30fps animation loop without any
 * main-thread cost — the UI remains fully responsive even during heavy
 * re-renders elsewhere in the app.
 */

interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  density: number;
  speed: number;
  color: string;
  particleCount: number;
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
  dpr: number;
}

interface PauseMessage {
  type: 'pause' | 'resume';
}

type IncomingMessage = InitMessage | ResizeMessage | PauseMessage;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  twinkle: number;
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let particles: Particle[] = [];
let config = {
  density: 0.6,
  speed: 0.3,
  color: '#00D4FF',
  particleCount: 50,
};
let rafId: number | null = null;
let lastFrame = 0;
let paused = false;

function initParticles(count: number): void {
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * config.speed,
    vy: (Math.random() - 0.5) * config.speed,
    size: Math.random() * 1.8 + 0.2,
    opacity: Math.random() * config.density,
    twinkle: Math.random() * Math.PI * 2,
  }));
}

function loop(t: number): void {
  if (paused || !ctx) {
    rafId = requestAnimationFrame(loop);
    return;
  }
  // Throttle to ~30fps — ambient movement doesn't need full 60.
  if (t - lastFrame < 33) {
    rafId = requestAnimationFrame(loop);
    return;
  }
  lastFrame = t;

  ctx.clearRect(0, 0, width, height);
  // One-time setup per frame: shadowBlur provides the glow so we don't
  // have to allocate a radial gradient per particle.
  ctx.shadowColor = config.color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = config.color;

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

  // Restore defaults so we don't leak state across frames.
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  rafId = requestAnimationFrame(loop);
}

self.onmessage = (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    canvas = msg.canvas;
    width = msg.width;
    height = msg.height;
    const ctxLocal = canvas.getContext('2d');
    if (!ctxLocal) return;
    ctx = ctxLocal;
    canvas.width = width * msg.dpr;
    canvas.height = height * msg.dpr;
    ctx.scale(msg.dpr, msg.dpr);
    config = {
      density: msg.density,
      speed: msg.speed,
      color: msg.color,
      particleCount: msg.particleCount,
    };
    initParticles(msg.particleCount);
    if (rafId === null) rafId = requestAnimationFrame(loop);
  } else if (msg.type === 'resize') {
    if (!canvas || !ctx) return;
    width = msg.width;
    height = msg.height;
    canvas.width = width * msg.dpr;
    canvas.height = height * msg.dpr;
    // Reset transform before scaling to avoid cumulative scale across resizes.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(msg.dpr, msg.dpr);
  } else if (msg.type === 'pause') {
    paused = true;
  } else if (msg.type === 'resume') {
    paused = false;
  }
};

export {};
