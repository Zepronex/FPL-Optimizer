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
          dark: '#37003c',
          purple: '#7c3aed',
        }
      }
    },
  },
  plugins: [],
}

