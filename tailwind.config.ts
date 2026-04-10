import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#11ff99",
          yellow: "#ffc53d",
          orange: "#ff801f",
          blue: "#3b9eff",
          red: "#ff2047",
        },
        dark: {
          bg: "#000000",
          card: "rgba(255, 255, 255, 0.03)",
          border: "rgba(214, 235, 253, 0.19)",
        },
        frost: {
          border: "rgba(214, 235, 253, 0.19)",
          "border-alt": "rgba(217, 237, 254, 0.145)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        "pill": "9999px",
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "countdown": "countdown linear forwards",
      },
      keyframes: {
        countdown: {
          "0%": { width: "100%" },
          "100%": { width: "0%" },
        },
      },
      boxShadow: {
        "frost": "rgba(176, 199, 217, 0.145) 0px 0px 0px 1px",
        "frost-lg": "rgba(176, 199, 217, 0.10) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 4px 16px",
      },
    },
  },
  plugins: [],
};

export default config;
