/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef7f0',
          100: '#fde8d7',
          200: '#fbcea8',
          300: '#f9b479',
          400: '#f79a4a',
          500: '#f5801b',
          600: '#c46616',
          700: '#934d11',
          800: '#62330b',
          900: '#311a06',
        },
      },
    },
  },
  plugins: [],
}
