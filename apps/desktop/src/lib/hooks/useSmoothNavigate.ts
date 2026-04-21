import { useCallback } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router-dom';
import { startViewTransition } from '@/lib/viewTransitions';

/**
 * Drop-in replacement for `useNavigate` that wraps navigation in a
 * native View Transition when available. On browsers without support
 * (or if the transition fails) it falls back to plain navigation.
 *
 * Use on prominent, visually-anchored navigations (home→project, hero
 * CTAs, back buttons) where the crossfade is noticeable and welcome.
 * Not worth adopting everywhere — most in-app clicks are fine with
 * the existing framer-motion page wrapper.
 */
export function useSmoothNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      startViewTransition(() => {
        if (typeof to === 'number') {
          navigate(to);
        } else {
          navigate(to, options);
        }
      });
    },
    [navigate],
  );
}
