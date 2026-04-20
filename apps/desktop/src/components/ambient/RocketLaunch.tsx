import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';
import { Rocket } from 'lucide-react';

interface RocketLaunchItem {
  id: number;
  x: number;
  y: number;
  label?: string;
}

interface RocketState {
  launches: RocketLaunchItem[];
  fire: (x: number, y: number, label?: string) => void;
}

let rocketId = 0;

export const useRocketStore = create<RocketState>((set) => ({
  launches: [],
  fire: (x, y, label) => {
    const id = ++rocketId;
    set((s) => ({ launches: [...s.launches, { id, x, y, label }] }));
    // Auto-remove after animation completes
    setTimeout(() => {
      set((s) => ({ launches: s.launches.filter((l) => l.id !== id) }));
    }, 2500);
  },
}));

/** Trigger a rocket from an element's bounding rect. */
export function launchFromElement(el: HTMLElement | null, label?: string) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  useRocketStore
    .getState()
    .fire(rect.left + rect.width / 2, rect.top + rect.height / 2, label);
}

/** Trigger a rocket from a pointer event (or any object with clientX/clientY). */
export function launchFromEvent(
  e: { clientX: number; clientY: number } | React.MouseEvent,
  label?: string,
) {
  useRocketStore.getState().fire(e.clientX, e.clientY, label);
}

export default function RocketLaunch() {
  const launches = useRocketStore((s) => s.launches);

  return (
    <div className="fixed inset-0 pointer-events-none z-[200]">
      <AnimatePresence>
        {launches.map((l) => (
          <motion.div
            key={l.id}
            initial={{ left: l.x, top: l.y, opacity: 0, scale: 0.5 }}
            animate={{
              left: l.x + (Math.random() - 0.5) * 40,
              top: -100,
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1.2, 1, 0.8],
              rotate: 0,
            }}
            transition={{
              duration: 1.8,
              ease: [0.25, 0.1, 0.25, 1],
              opacity: { times: [0, 0.1, 0.85, 1] },
              scale: { times: [0, 0.15, 0.4, 1] },
            }}
            style={{ position: 'absolute' }}
            className="flex flex-col items-center"
          >
            {/* Rocket */}
            <div className="relative">
              <Rocket
                className="w-8 h-8 text-viral-medium"
                style={{ filter: 'drop-shadow(0 0 12px #00D4FF)' }}
              />
              {/* Trail */}
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.8, times: [0, 0.15, 0.8, 1] }}
                className="absolute top-full left-1/2 -translate-x-1/2 w-1.5 origin-top"
                style={{
                  height: 60,
                  background:
                    'linear-gradient(to bottom, #00D4FF, #F97316 40%, transparent)',
                  filter: 'blur(1px)',
                }}
              />
            </div>
            {/* Label */}
            {l.label && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: [0, 1, 1, 0], y: 0 }}
                transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
                className="mt-1 text-[10px] font-bold text-viral-medium tabular-nums whitespace-nowrap"
                style={{ textShadow: '0 0 8px #00D4FF' }}
              >
                {l.label}
              </motion.div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Ground burst particles at each launch site */}
      <AnimatePresence>
        {launches.map((l) => (
          <GroundBurst key={`burst-${l.id}`} x={l.x} y={l.y} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function GroundBurst({ x, y }: { x: number; y: number }) {
  const [particles] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({
      angle: (i / 6) * Math.PI * 2,
      distance: 20 + Math.random() * 15,
    })),
  );
  return (
    <>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ left: x, top: y, opacity: 1, scale: 0.5 }}
          animate={{
            left: x + Math.cos(p.angle) * p.distance,
            top: y + Math.sin(p.angle) * p.distance,
            opacity: 0,
            scale: 0,
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ position: 'absolute' }}
          className="w-1.5 h-1.5 rounded-full bg-viral-medium"
        />
      ))}
    </>
  );
}
