import type { Config } from 'tailwindcss';

/**
 * Tailwind is a THIN MAPPING over src/styles/tokens.css — never a second source
 * of truth. Every scale below resolves to a custom property, so a token change
 * propagates everywhere and a utility can never invent a value that isn't in the
 * system. Tailwind's default color/spacing/font scales are replaced outright
 * (not extended) so `bg-gray-500` and friends fail loudly rather than smuggling
 * an off-system value into a component.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    // ── Colour ──────────────────────────────────────────────────────────────
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      canvas: 'var(--surface-canvas)',
      surface: {
        1: 'var(--surface-1)',
        2: 'var(--surface-2)',
        3: 'var(--surface-3)',
        inset: 'var(--surface-inset)',
      },
      border: {
        subtle: 'var(--border-subtle)',
        DEFAULT: 'var(--border-default)',
        strong: 'var(--border-strong)',
      },
      ink: {
        DEFAULT: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        inverse: 'var(--text-inverse)',
      },
      brand: {
        DEFAULT: 'var(--brand)',
        hover: 'var(--brand-hover)',
        press: 'var(--brand-press)',
        ink: 'var(--brand-ink)',
        faint: 'var(--brand-faint)',
      },
      series: {
        1: 'var(--series-1)',
        2: 'var(--series-2)',
        3: 'var(--series-3)',
        4: 'var(--series-4)',
        5: 'var(--series-5)',
        6: 'var(--series-6)',
        7: 'var(--series-7)',
        8: 'var(--series-8)',
      },
      seq: {
        100: 'var(--seq-100)',
        200: 'var(--seq-200)',
        300: 'var(--seq-300)',
        400: 'var(--seq-400)',
        500: 'var(--seq-500)',
        600: 'var(--seq-600)',
        700: 'var(--seq-700)',
      },
      div: {
        'neg-3': 'var(--div-neg-3)',
        'neg-2': 'var(--div-neg-2)',
        'neg-1': 'var(--div-neg-1)',
        mid: 'var(--div-mid)',
        'pos-1': 'var(--div-pos-1)',
        'pos-2': 'var(--div-pos-2)',
        'pos-3': 'var(--div-pos-3)',
      },
      status: {
        good: 'var(--status-good)',
        warning: 'var(--status-warning)',
        serious: 'var(--status-serious)',
        critical: 'var(--status-critical)',
        'good-faint': 'var(--status-good-faint)',
        'warning-faint': 'var(--status-warning-faint)',
        'serious-faint': 'var(--status-serious-faint)',
        'critical-faint': 'var(--status-critical-faint)',
      },
      band: {
        champion: 'var(--band-champion)',
        ucl: 'var(--band-ucl)',
        uel: 'var(--band-uel)',
        conference: 'var(--band-conference)',
        'relegation-playoff': 'var(--band-relegation-playoff)',
        relegation: 'var(--band-relegation)',
      },
      // The active competition's accent. A layout-level `data-competition`
      // attribute rebinds --comp-active, so a page themes itself by context.
      comp: 'var(--comp-active, var(--comp-default))',
    },

    // ── Type ────────────────────────────────────────────────────────────────
    fontFamily: {
      display: 'var(--font-display)',
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    fontSize: {
      '2xs': ['var(--text-2xs)', { lineHeight: 'var(--leading-snug)' }],
      xs: ['var(--text-xs)', { lineHeight: 'var(--leading-snug)' }],
      sm: ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
      base: ['var(--text-base)', { lineHeight: 'var(--leading-normal)' }],
      lg: ['var(--text-lg)', { lineHeight: 'var(--leading-relaxed)' }],
      xl: ['var(--text-xl)', { lineHeight: 'var(--leading-snug)' }],
      '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-snug)' }],
      '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)' }],
      '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
      '5xl': ['var(--text-5xl)', { lineHeight: 'var(--leading-tight)' }],
    },
    fontWeight: {
      regular: 'var(--weight-regular)',
      medium: 'var(--weight-medium)',
      semibold: 'var(--weight-semibold)',
      bold: 'var(--weight-bold)',
    },
    letterSpacing: {
      tighter: 'var(--tracking-tighter)',
      tight: 'var(--tracking-tight)',
      normal: 'var(--tracking-normal)',
      wide: 'var(--tracking-wide)',
      caps: 'var(--tracking-caps)',
    },
    lineHeight: {
      tight: 'var(--leading-tight)',
      snug: 'var(--leading-snug)',
      normal: 'var(--leading-normal)',
      relaxed: 'var(--leading-relaxed)',
    },

    // ── Space (8pt grid) ────────────────────────────────────────────────────
    spacing: {
      0: 'var(--space-0)',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      7: 'var(--space-7)',
      8: 'var(--space-8)',
      9: 'var(--space-9)',
      10: 'var(--space-10)',
      px: '1px',
      full: '100%',
    },

    borderRadius: {
      none: '0',
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      pill: 'var(--radius-pill)',
      full: '9999px',
    },

    boxShadow: {
      none: 'var(--shadow-none)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      xl: 'var(--shadow-xl)',
      focus: 'var(--shadow-focus)',
      glow: 'var(--glow-brand)',
    },

    transitionDuration: {
      instant: 'var(--duration-instant)',
      fast: 'var(--duration-fast)',
      normal: 'var(--duration-normal)',
      slow: 'var(--duration-slow)',
      deliberate: 'var(--duration-deliberate)',
    },
    transitionTimingFunction: {
      standard: 'var(--ease-standard)',
      decelerate: 'var(--ease-decelerate)',
      accelerate: 'var(--ease-accelerate)',
      spring: 'var(--ease-spring)',
    },

    zIndex: {
      auto: 'auto',
      0: '0',
      sticky: 'var(--z-sticky)',
      header: 'var(--z-header)',
      popover: 'var(--z-popover)',
      modal: 'var(--z-modal)',
      toast: 'var(--z-toast)',
    },

    extend: {
      maxWidth: {
        container: 'var(--container-max)',
        prose: 'var(--container-prose)',
      },
      height: { header: 'var(--header-height)' },
      inset: { header: 'var(--header-stack)' },
      borderWidth: { DEFAULT: '1px', 0: '0', 2: '2px', 3: '3px', 4: '4px' },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'live-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        'tick-up': {
          from: { opacity: '0', transform: 'translateY(60%)' },
          to: { opacity: '1', transform: 'none' },
        },
        'tick-down': {
          from: { opacity: '0', transform: 'translateY(-60%)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up var(--duration-normal) var(--ease-decelerate) both',
        'live-pulse': 'live-pulse 2s var(--ease-standard) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'tick-up': 'tick-up var(--duration-normal) var(--ease-decelerate) both',
        'tick-down': 'tick-down var(--duration-normal) var(--ease-decelerate) both',
      },
    },
  },
  plugins: [],
};

export default config;
