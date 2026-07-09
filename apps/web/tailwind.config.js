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
          dark: '#111827',
          'dark-light': '#1f2937',
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

