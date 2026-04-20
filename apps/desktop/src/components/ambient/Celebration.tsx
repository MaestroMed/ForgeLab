import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';

export type CelebrationType = 'viral' | 'export' | 'approve' | 'bigwin';

interface CelebrationItem {
  id: number;
  type: CelebrationType;
  x: number;
  y: number;
  label?: string;
}

interface CelebrationState {
  active: CelebrationItem[];
  trigger: (type: CelebrationType, x?: number, y?: number, label?: string) => void;
}

let celebId = 0;

export const useCelebrationStore = create<CelebrationState>((set) => ({
  active: [],
  trigger: (type, x, y, label) => {
    const id = ++celebId;
    const cx = x ?? window.innerWidth / 2;
    const cy = y ?? window.innerHeight / 2;
    set((s) => ({ active: [...s.active, { id, type, x: cx, y: cy, label }] }));
    setTimeout(() => {
      set((s) => ({ active: s.active.filter((c) => c.id !== id) }));
    }, 3500);
  },
}));

/** Trigger a celebration burst anywhere in the app. */
export function celebrate(
  type: CelebrationType,
  x?: number,
  y?: number,
  label?: string,
) {
  useCelebrationStore.getState().trigger(type, x, y, label);
}

/** Trigger a celebration from an element's bounding rect. */
export function celebrateFromElement(
  type: CelebrationType,
  el: HTMLElement | null,
  label?: string,
) {
  if (!el) {
    celebrate(type, undefined, undefined, label);
    return;
  }
  const rect = el.getBoundingClientRect();
  celebrate(type, rect.left + rect.width / 2, rect.top + rect.height / 2, label);
}

const PRESETS: Record<
  CelebrationType,
  { colors: string[]; particleCount: number; label?: string }
> = {
  viral: {
    colors: ['#EF4444', '#F59E0B', '#FACC15'],
    particleCount: 32,
    label: '🔥 VIRAL MOMENT',
  },
  export: {
    colors: ['#00D4FF', '#10B981', '#8B5CF6'],
    particleCount: 20,
    label: '🚀 EXPORTED',
  },
  approve: {
    colors: ['#22C55E', '#10B981'],
    particleCount: 12,
    label: '✓',
  },
  bigwin: {
    colors: ['#FACC15', '#F59E0B', '#EF4444', '#00D4FF'],
    particleCount: 48,
    label: '★',
  },
};

export default function Celebration() {
  const active = useCelebrationStore((s) => s.active);

  return (
    <div className="fixed inset-0 pointer-events-none z-[210]">
      <AnimatePresence>
        {active.map((c) => (
          <CelebrationBurst key={c.id} {...c} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function CelebrationBurst({
  type,
  x,
  y,
  label,
}: {
  type: CelebrationType;
  x: number;
  y: number;
  label?: string;
}) {
  const preset = PRESETS[type];
  const particles = Array.from({ length: preset.particleCount }, (_, i) => ({
    angle: (i / preset.particleCount) * Math.PI * 2 + Math.random() * 0.5,
    distance: 80 + Math.random() * 120,
    color: preset.colors[i % preset.colors.length],
    size: 3 + Math.random() * 3,
    delay: Math.random() * 0.1,
  }));

  const displayLabel = label ?? preset.label;

  return (
    <>
      {/* Central flash */}
      <motion.div
        initial={{ left: x, top: y, opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0, 3, 6] }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute rounded-full"
        style={{
          width: 40,
          height: 40,
          marginLeft: -20,
          marginTop: -20,
          background: `radial-gradient(circle, ${preset.colors[0]}80, transparent)`,
          position: 'absolute',
        }}
      />

      {/* Particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ left: x, top: y, opacity: 0, scale: 0.5 }}
          animate={{
            left: x + Math.cos(p.angle) * p.distance,
            top: y + Math.sin(p.angle) * p.distance - 20 - Math.random() * 40,
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.2, 1, 0.3],
          }}
          transition={{
            duration: 1.2 + Math.random() * 0.6,
            delay: p.delay,
            ease: 'easeOut',
            opacity: { times: [0, 0.1, 0.7, 1] },
          }}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            position: 'absolute',
          }}
        />
      ))}

      {/* Label text */}
      {displayLabel && (
        <motion.div
          initial={{ left: x, top: y, opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: [0, 1, 1, 0], y: -60, scale: [0.8, 1.1, 1, 0.9] }}
          transition={{ duration: 2, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
          className="absolute font-bold text-2xl whitespace-nowrap pointer-events-none"
          style={{
            left: x,
            top: y,
            transform: 'translate(-50%, -50%)',
            color: preset.colors[0],
            textShadow: `0 0 20px ${preset.colors[0]}, 0 0 40px ${preset.colors[0]}60`,
            letterSpacing: '0.05em',
            position: 'absolute',
          }}
        >
          {displayLabel}
        </motion.div>
      )}
    </>
  );
}
