import type { Config } from "tailwindcss";

// RecruitSage palette (source of truth) as Tailwind tokens.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plum: { 50: "#F3EAF3", 100: "#DABBD8", 300: "#C38AC0", 500: "#9C6C9A", 700: "#734E71", 900: "#221521" },
        wine: { 50: "#F2CFD0", 300: "#E69B9F", 500: "#DC5F6C", 700: "#7B2E37", 900: "#1A0507" },
        teal: { 50: "#BCEDF2", 100: "#81CAD2", 300: "#66A2A8", 500: "#4F7F84", 700: "#375B5E", 900: "#091516" },
        olive: { 50: "#D6DD94", 100: "#AFB679", 300: "#8B905F", 500: "#6A6E48", 700: "#494C30", 900: "#0A0B05" },
        ink: { 50: "#EDEFF0", 100: "#C2C9CC", 300: "#9BA3A8", 500: "#595F61", 700: "#383B3D", 900: "#191B1C" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
