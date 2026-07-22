/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // Fraunces — the editorial display serif (titles + numerals). The one
        // deliberate identity move; body stays the platform system sans.
        display: ["Fraunces_700Bold"],
        "display-black": ["Fraunces_900Black"],
        "display-semi": ["Fraunces_600SemiBold"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",
        "destructive-foreground": "var(--destructive-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        "chart-1": "var(--chart-1)",
        "chart-2": "var(--chart-2)",
        "chart-3": "var(--chart-3)",
        "chart-4": "var(--chart-4)",
        "chart-5": "var(--chart-5)",
      },
      borderRadius: {
        sm: "12px",
        md: "14px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        clay: "0px 10px 30px -14px rgba(20, 34, 22, 0.18)",
        "clay-sm": "0px 4px 14px -8px rgba(20, 34, 22, 0.16)",
        "clay-lg": "0px 18px 40px -16px rgba(20, 34, 22, 0.26)",
      },
    },
  },
  plugins: [],
};
