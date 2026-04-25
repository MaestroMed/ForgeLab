import { useUIStore } from '@/store/ui';

/**
 * FORGE LAB 2.0 — Creator vs Operator mode.
 *
 * Creator  = animations, ceremony, SFX, ambient effects (default, demo-friendly)
 * Operator = dense, keyboard-first, minimal motion (power users)
 *
 * Components consuming this hook should short-circuit ambient/ceremony
 * rendering when `isOperator` is true, while keeping functional behavior
 * intact (jobs still run, state still updates).
 */
export function useAppMode() {
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const toggle = useUIStore((s) => s.toggleMode);
  const isOperator = mode === 'operator';
  const isCreator = mode === 'creator';
  return { mode, isOperator, isCreator, setMode, toggle };
}
