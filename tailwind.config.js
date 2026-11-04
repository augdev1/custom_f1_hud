/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        f1: {
          dark: '#6eb43eff',
          panel: 'rgba(13, 17, 23, 0.72)',
          border: 'rgba(255, 255, 255, 0.08)',
          red: '#E10600',
          cyan: '#09f1daff',
          purple: '#9B51E0',
          yellow: '#FFB800',
          green: '#00E676',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Rajdhani"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-red': '0 0 25px rgba(225, 6, 0, 0.5)',
        'glow-green': '0 0 25px rgba(0, 230, 118, 0.5)',
        'glow-cyan': '0 0 25px rgba(0, 210, 190, 0.5)',
        'glow-purple': '0 0 25px rgba(155, 81, 224, 0.6)',
      }
    },
  },
  plugins: [],
}
