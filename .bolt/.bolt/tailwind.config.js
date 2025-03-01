/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        // Light mode colors
        light: {
          bg: '#FFFFFF',
          surface: '#F3F3F3',
          text: {
            primary: '#121212',
            secondary: '#333333',
          },
        },
        // Dark mode colors
        dark: {
          bg: '#121212',
          surface: '#1E1E1E',
          text: {
            primary: '#EDEDED',
            secondary: '#B3B3B3',
          },
        },
        // Shared colors
        accent: {
          DEFAULT: '#DC2626',
          hover: '#E03434',
        },
        border: {
          light: '#E0E0E0',
          dark: '#292929',
        },
      },
    },
  },
  plugins: [],
};