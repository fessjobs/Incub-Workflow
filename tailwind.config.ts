import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Markenfarbe der incub:live-Gruppe (Midnight-Navy)
        navy: {
          DEFAULT: "#0B1220",
          50: "#F4F6FA",
          100: "#E7EBF3",
          200: "#C6CFE0",
          300: "#9DABC7",
          400: "#6B7C9E",
          500: "#465575",
          600: "#2E3B57",
          700: "#1E2941",
          800: "#141D30",
          900: "#0B1220",
          950: "#060B15",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F7F8FA",
          dark: "#0B1220",
          "dark-raised": "#141D30",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11, 18, 32, 0.04), 0 4px 16px rgba(11, 18, 32, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
