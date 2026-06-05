/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0a0a0f",
          1: "#12121a",
          2: "#1a1a25",
          3: "#222230",
        },
        accent: {
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
          blue: "#3b82f6",
          orange: "#f97316",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "SF Mono",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
