import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: "#0f5132",
          dark: "#0a3d25",
        },
        chip: {
          gold: "#f5c518",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "deal": {
          "0%": { opacity: "0", transform: "translateY(-12px) scale(0.9)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(245,197,24,0.7)" },
          "70%": { boxShadow: "0 0 0 10px rgba(245,197,24,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(245,197,24,0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "deal": "deal 0.35s ease-out",
        "pulse-ring": "pulse-ring 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
