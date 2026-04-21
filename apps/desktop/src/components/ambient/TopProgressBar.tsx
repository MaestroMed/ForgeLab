import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * A thin top progress bar that shows during route transitions (including
 * Suspense fallbacks for lazy pages).
 *
 * Each location change triggers a brief pulse of the bar — enough to
 * communicate "something is loading" without taking over the screen.
 */
export default function TopProgressBar() {
  const location = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Whenever location changes, briefly show the progress bar.
    // Useful for lazy-loaded pages that take a moment to fetch.
    setShow(true);
    const t = setTimeout(() => setShow(false), 400);
    return () => clearTimeout(t);
  }, [location.key]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 h-0.5 z-[100] origin-left pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, #00D4FF, #F59E0B)',
            boxShadow: '0 0 8px rgba(0, 212, 255, 0.6)',
          }}
        />
      )}
    </AnimatePresence>
  );
}
