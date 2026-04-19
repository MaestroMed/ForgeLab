/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0a0a0f',
          card: '#12121a',
          border: '#1e1e2e',
          cyan: '#00BFFF',
          green: '#00FF88',
          red: '#FF4444',
          yellow: '#FFD700',
        },
      },
    },
  },
  plugins: [],
};
