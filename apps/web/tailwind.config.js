/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fpl: {
          green: '#00ff85',
          'green-dark': '#00cc6a',
          'green-light': '#33ff99',
          dark: '#37003c',
          'dark-light': '#4a0a50',
          purple: '#7c3aed',
          'purple-light': '#8b5cf6',
          gold: '#ffd700',
          'gold-dark': '#ffb700',
          red: '#ef4444',
          'red-light': '#f87171',
          blue: '#3b82f6',
          'blue-light': '#60a5fa',
        }
      }
    },
  },
  plugins: [],
}

