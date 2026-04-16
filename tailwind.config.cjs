module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a1628',
        surface: '#111e2e',
        surfaceAlt: '#1a2a3f',
        crimson: '#dc2626',
        crimsonDim: '#991b1b',
        gold: '#fbbf24',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        textMuted: '#64748b',
        border: '#1e293b',
      },
      fontFamily: {
        serif: ['Fraunces', 'ui-serif', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        site: '1200px',
      },
    },
  },
  plugins: [],
};
