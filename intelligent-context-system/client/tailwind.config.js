/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#0044FF", // Electric Blue Accent
        "secondary": "#F3F4F6", // Soft Gray
        "text-main": "#000000",
        "text-muted": "#6B7280",
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"]
      },
      spacing: {
        '128': '32rem',
      }
    },
  },
  plugins: [],
}