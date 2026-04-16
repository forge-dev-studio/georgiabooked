module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        base: '#060c18',
        surface: '#0d1524',
        surfaceAlt: '#151f33',
        crimson: '#dc2626',
        crimsonDim: '#991b1b',
        gold: '#fbbf24',
        inkBlue: '#2563eb',
        paper: '#f5f1e8',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        textMuted: '#64748b',
        border: '#1e2a42',
      },
      fontFamily: {
        serif: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        site: '1200px',
        narrow: '860px',
      },
      letterSpacing: {
        tightest: '-0.04em',
        deadline: '-0.035em',
      },
      keyframes: {
        staggerFade: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        hotPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.55)' },
          '50%': { boxShadow: '0 0 0 10px rgba(220, 38, 38, 0)' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'stagger-fade': 'staggerFade 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
        'hot-pulse': 'hotPulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'count-up': 'countUp 640ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
