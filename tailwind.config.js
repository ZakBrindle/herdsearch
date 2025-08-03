// tailwind.config.js
/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Updated to match the screenshot
        'brand-blue': '#2563eb',
        'brand-purple': '#7c3aed',
        'brand-red': '#dc2626',
        neutral: {
          ...colors.slate,
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
       boxShadow: {
        'card': '0 4px 12px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 6px 16px rgba(0, 0, 0, 0.12)',
      }
    },
  },
  plugins: [],
};