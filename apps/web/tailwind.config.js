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
          green: '#0f766e',
          'green-dark': '#115e59',
          'green-light': '#14b8a6',
          dark: '#111827',
          'dark-light': '#374151',
          gold: '#b45309',
          'gold-dark': '#92400e',
          red: '#dc2626',
          'red-light': '#ef4444',
          blue: '#1d4ed8',
          'blue-light': '#2563eb',
        }
      }
    },
  },
  plugins: [],
}

