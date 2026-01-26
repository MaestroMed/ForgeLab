/**
 * Framer Motion animation variants and configs
 * Spring physics for buttery smooth interactions
 */

import type { Variants, Transition } from 'framer-motion';

// Spring physics config - snappy but natural
export const springConfig: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

// Softer spring for larger elements
export const softSpring: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
};

// Quick spring for micro-interactions
export const quickSpring: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
};

// Hover & tap animation props
export const hoverScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: springConfig,
};

// Subtle hover lift
export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { y: 0 },
  transition: springConfig,
};

// Button press effect
export const buttonPress = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.95 },
  transition: quickSpring,
};

// Card hover effect
export const cardHover = {
  whileHover: { 
    scale: 1.01,
    y: -2,
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
  },
  transition: softSpring,
};

// Stagger container for list animations
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

// Stagger item - fade up
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: softSpring,
  },
};

// Slide in from right
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  show: { 
    opacity: 1, 
    x: 0,
    transition: springConfig,
  },
  exit: { 
    opacity: 0, 
    x: -50,
    transition: { duration: 0.2 },
  },
};

// Slide in from bottom
export const slideInBottom: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: springConfig,
  },
  exit: { 
    opacity: 0, 
    y: 20,
    transition: { duration: 0.15 },
  },
};

// Scale fade - for modals
export const scaleFade: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
  },
  show: { 
    opacity: 1, 
    scale: 1,
    transition: springConfig,
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// Fade only
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { 
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

// Page transition variants
export const pageTransition: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: springConfig,
  },
  exit: { 
    opacity: 0, 
    x: -20,
    transition: { duration: 0.15 },
  },
};

// Drawer animation (bottom)
export const drawerVariants: Variants = {
  hidden: { y: '100%' },
  show: { 
    y: 0,
    transition: springConfig,
  },
  exit: { 
    y: '100%',
    transition: { duration: 0.2 },
  },
};

// Backdrop fade
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0 },
};

// Pulse glow animation for active states
export const pulseGlow: Variants = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(16, 185, 129, 0.4)',
      '0 0 0 10px rgba(16, 185, 129, 0)',
      '0 0 0 0 rgba(16, 185, 129, 0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeOut',
    },
  },
};

// Number counter animation helper
export const counterSpring: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 15,
};

// Skeleton loading pulse
export const skeletonPulse: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// WESTWORLD THEME SPECIFIC ANIMATIONS
// ============================================

// Westworld card hover with glow
export const westworldCardHover = {
  whileHover: { 
    scale: 1.02,
    boxShadow: '0 0 30px rgba(0, 212, 255, 0.15)',
    borderColor: 'rgba(0, 212, 255, 0.25)',
  },
  transition: { duration: 0.2 },
};

// Glow pulse animation
export const westworldGlowPulse: Variants = {
  animate: {
    boxShadow: [
      '0 0 20px rgba(0, 212, 255, 0.1)',
      '0 0 40px rgba(0, 212, 255, 0.2)',
      '0 0 20px rgba(0, 212, 255, 0.1)',
    ],
    transition: { 
      duration: 2, 
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Scan-in effect for appearing elements
export const westworldScanIn: Variants = {
  hidden: { 
    opacity: 0, 
    y: -10, 
    filter: 'blur(4px)',
  },
  show: { 
    opacity: 1, 
    y: 0, 
    filter: 'blur(0px)',
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

// Data stream background animation
export const westworldDataStream: Variants = {
  animate: {
    backgroundPosition: ['0% 0%', '100% 100%'],
    transition: { 
      duration: 3, 
      repeat: Infinity, 
      ease: 'linear',
    },
  },
};

// Stagger container for Westworld lists
export const westworldStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
};

// Stagger item with scan effect
export const westworldStaggerItem: Variants = {
  hidden: { 
    opacity: 0, 
    x: -20, 
    filter: 'blur(2px)',
  },
  show: { 
    opacity: 1, 
    x: 0,
    filter: 'blur(0px)',
    transition: { 
      duration: 0.25,
      ease: 'easeOut',
    },
  },
};

// Text reveal with glow
export const westworldTextReveal: Variants = {
  hidden: { 
    opacity: 0,
    textShadow: '0 0 0px rgba(0, 212, 255, 0)',
  },
  show: {
    opacity: 1,
    textShadow: '0 0 10px rgba(0, 212, 255, 0.3)',
    transition: { duration: 0.4 },
  },
};

// Breathing glow for active indicators
export const westworldBreathe: Variants = {
  animate: {
    boxShadow: [
      '0 0 20px rgba(0, 212, 255, 0.1)',
      '0 0 40px rgba(0, 212, 255, 0.2)',
    ],
    transition: {
      duration: 3,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
};

// Glitch effect for errors or alerts
export const westworldGlitch: Variants = {
  glitch: {
    x: [0, -2, 2, -1, 1, 0],
    filter: [
      'hue-rotate(0deg)',
      'hue-rotate(90deg)',
      'hue-rotate(-90deg)',
      'hue-rotate(45deg)',
      'hue-rotate(0deg)',
    ],
    transition: { duration: 0.3 },
  },
};

// Button with neon effect
export const westworldButtonPress = {
  whileHover: { 
    scale: 1.02,
    filter: 'brightness(1.1)',
    boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
  },
  whileTap: { 
    scale: 0.98,
    filter: 'brightness(0.95)',
  },
  transition: quickSpring,
};

// Modal entrance with scan effect
export const westworldModal: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
    filter: 'blur(4px) brightness(1.2)',
  },
  show: { 
    opacity: 1, 
    scale: 1,
    filter: 'blur(0px) brightness(1)',
    transition: { duration: 0.3 },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    filter: 'blur(4px) brightness(0.8)',
    transition: { duration: 0.2 },
  },
};

// Progress bar with glow trail
export const westworldProgress = {
  initial: { width: 0, boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)' },
  animate: (progress: number) => ({
    width: `${progress}%`,
    boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
    transition: { duration: 0.3, ease: 'easeOut' },
  }),
};




