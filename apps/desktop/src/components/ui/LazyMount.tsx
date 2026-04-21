import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /**
   * Distance (in px or CSS length) from the viewport at which to start
   * rendering. A generous margin (default 400px) hides the promotion from
   * the user — by the time they scroll to the section it's already mounted.
   */
  rootMargin?: string;
  /** Placeholder rendered while off-screen. Should reserve roughly the same
   * vertical space so the page doesn't jump when the real content swaps in. */
  fallback?: ReactNode;
  /** When true, mount once and never unmount (default). When false, unmount
   * again after scrolling away — useful for very heavy components that can
   * be recreated cheaply. */
  once?: boolean;
}

/**
 * Render children only when the placeholder enters the viewport. Uses
 * IntersectionObserver under the hood with a generous rootMargin so the
 * promotion happens before the user actually sees the section — this way
 * the component mounts during the scroll deceleration and the user never
 * sees a blank placeholder in-view.
 *
 * Pair with a sized fallback (`<div className="h-64" />`) so scrollbar
 * height stays stable.
 */
export default function LazyMount({
  children,
  rootMargin = '400px',
  fallback = null,
  once = true,
}: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && once) return;
    const el = ref.current;
    if (!el) return;
    // Bail out gracefully in environments without IntersectionObserver
    // (older test runners, SSR shim). Just render the children eagerly.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin, once]);

  return <div ref={ref}>{visible ? children : fallback}</div>;
}
