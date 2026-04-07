
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // ============================================
      // TYPOGRAPHY SYSTEM
      // ============================================
      fontFamily: {
        'sans': ['Poppins', 'system-ui', 'sans-serif'],
        'heading': ['Poppins', 'system-ui', 'sans-serif'],
        'body': ['Poppins', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Semantic type scale
        'display': ['2.25rem', { lineHeight: '1.1', fontWeight: '700' }],      // 36px - Hero titles
        'heading-lg': ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],    // 24px - Page titles
        'heading': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],      // 20px - Section titles
        'heading-sm': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],  // 18px - Card titles
        'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],         // 16px - Large body
        'body': ['0.875rem', { lineHeight: '1.6', fontWeight: '400' }],        // 14px - Default body
        'body-sm': ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],    // 13px - Small body
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],      // 12px - Labels, captions
        'overline': ['0.6875rem', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.05em' }], // 11px - Overlines
      },

      // ============================================
      // COLOR SYSTEM
      // ============================================
      colors: {
        // Primary palette (Purple)
        primary: {
          DEFAULT: '#6A469D',
          50: '#F8F5FC',
          100: '#F0EAFA',
          200: '#DED0F2',
          300: '#C4ACE5',
          400: '#A680D5',
          500: '#6A469D',
          600: '#5B3C87',
          700: '#4C3271',
          800: '#3D285B',
          900: '#2E1E45',
          950: '#1F142E',
        },
        // Brand accent colors
        accent: {
          cyan: '#50C8DF',
          'cyan-light': '#E8FBFF',
          'cyan-dark': '#3BA8BD',
          green: '#34B256',
          'green-light': '#E8F8ED',
          'green-dark': '#2A9147',
          yellow: '#FACC29',
          'yellow-light': '#FEF9E8',
          'yellow-dark': '#C9A21F',
          orange: '#F79A30',
          'orange-light': '#FEF4E8',
          'orange-dark': '#C77A26',
          pink: '#DA2E72',
          'pink-light': '#FCE8F0',
          'pink-dark': '#AE255B',
          navy: '#2D2F8E',
          'navy-light': '#E8E8F8',
          'navy-dark': '#24266F',
        },
        // Semantic colors for status/feedback
        success: {
          DEFAULT: '#34B256',
          light: '#E8F8ED',
          dark: '#2A9147',
        },
        warning: {
          DEFAULT: '#F79A30',
          light: '#FEF4E8',
          dark: '#C77A26',
        },
        error: {
          DEFAULT: '#DA2E72',
          light: '#FCE8F0',
          dark: '#AE255B',
        },
        info: {
          DEFAULT: '#50C8DF',
          light: '#E8FBFF',
          dark: '#3BA8BD',
        },
        // Brand shortcuts (backwards compatible)
        brand: {
          'cyan': '#50C8DF',
          'purple': '#6A469D',
          'green': '#34B256',
          'yellow': '#FACC29',
          'orange': '#F79A30',
          'pink': '#DA2E72',
          'navy': '#2D2F8E',
          'light': '#E8FBFF',
        },
        // Neutral palette for text, backgrounds, borders
        neutral: {
          0: '#FFFFFF',
          50: '#FAFAFA',
          100: '#F5F5F5',
          150: '#EDEDED',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0A0A0A',
        },
        // Chart colors (mirrors src/utils/chartTheme.js for Tailwind class usage)
        chart: {
          indigo: '#6366f1',
          violet: '#8b5cf6',
          cyan: '#06b6d4',
          teal: '#14b8a6',
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
          emerald: '#10b981',
          target: '#7c3aed',
          forecast: '#3b82f6',
        },
        // Surface colors for cards, backgrounds
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FFFFFF',
          overlay: 'rgba(0, 0, 0, 0.5)',
          muted: '#FAFAFA',
          subtle: '#F5F5F5',
        },
      },

      // ============================================
      // SPACING & SIZING SYSTEM
      // ============================================
      spacing: {
        '0.5': '0.125rem',   // 2px
        '1': '0.25rem',      // 4px
        '1.5': '0.375rem',   // 6px
        '2': '0.5rem',       // 8px
        '2.5': '0.625rem',   // 10px
        '3': '0.75rem',      // 12px
        '3.5': '0.875rem',   // 14px
        '4': '1rem',         // 16px
        '5': '1.25rem',      // 20px
        '6': '1.5rem',       // 24px
        '7': '1.75rem',      // 28px
        '8': '2rem',         // 32px
        '9': '2.25rem',      // 36px
        '10': '2.5rem',      // 40px
        '11': '2.75rem',     // 44px - Touch target minimum
        '12': '3rem',        // 48px
        '14': '3.5rem',      // 56px
        '16': '4rem',        // 64px
        '18': '4.5rem',      // 72px
        '20': '5rem',        // 80px
        '24': '6rem',        // 96px
        '28': '7rem',        // 112px
        '32': '8rem',        // 128px
        '36': '9rem',        // 144px
        '40': '10rem',       // 160px
        '44': '11rem',       // 176px
        '48': '12rem',       // 192px
        '52': '13rem',       // 208px
        '56': '14rem',       // 224px
        '60': '15rem',       // 240px
        '64': '16rem',       // 256px
        '72': '18rem',       // 288px
        '80': '20rem',       // 320px
        '88': '22rem',       // 352px
        '96': '24rem',       // 384px
        '128': '32rem',      // 512px
      },

      // ============================================
      // BORDER RADIUS SYSTEM
      // ============================================
      borderRadius: {
        'none': '0',
        'sm': '0.25rem',     // 4px - Subtle rounding
        'DEFAULT': '0.5rem', // 8px - Default
        'md': '0.625rem',    // 10px - Medium
        'lg': '0.75rem',     // 12px - Large
        'xl': '1rem',        // 16px - Extra large
        '2xl': '1.25rem',    // 20px - Cards, modals
        '3xl': '1.5rem',     // 24px - Hero elements
        'full': '9999px',    // Pill shape
        // Semantic aliases
        'button': '0.625rem',   // 10px
        'input': '0.625rem',    // 10px
        'card': '0.875rem',     // 14px
        'modal': '1rem',        // 16px
        'pill': '9999px',
      },

      // ============================================
      // SHADOW SYSTEM
      // ============================================
      boxShadow: {
        'none': 'none',
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'DEFAULT': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        // Semantic shadows
        'card': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.08)',
        'dropdown': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'modal': '0 20px 40px rgba(0, 0, 0, 0.15)',
        'button': '0 1px 3px rgba(0, 0, 0, 0.08)',
        'button-hover': '0 4px 8px rgba(0, 0, 0, 0.12)',
        // Brand-colored shadows
        'primary': '0 4px 14px rgba(106, 70, 157, 0.25)',
        'primary-lg': '0 8px 24px rgba(106, 70, 157, 0.3)',
        'success': '0 4px 14px rgba(52, 178, 86, 0.25)',
        'error': '0 4px 14px rgba(218, 46, 114, 0.25)',
      },

      // ============================================
      // BREAKPOINTS
      // ============================================
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },

      // ============================================
      // TRANSITIONS & ANIMATIONS
      // ============================================
      transitionDuration: {
        'fast': '150ms',
        'DEFAULT': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'scale-out': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'peek': {
          '0%, 100%': {
            transform: 'translateX(-50%) translateY(100%)',
            opacity: '1',
          },
          '50%': {
            transform: 'translateX(-50%) translateY(-20px)',
            opacity: '1',
          },
        },
        'slideIn': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slideOut': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'fade-out': 'fade-out 200ms ease-in',
        'slide-up': 'slide-up 300ms ease-out',
        'slide-down': 'slide-down 300ms ease-out',
        'slide-in-right': 'slide-in-right 300ms ease-out',
        'slide-out-right': 'slide-out-right 300ms ease-in',
        'scale-in': 'scale-in 200ms ease-out',
        'scale-out': 'scale-out 200ms ease-in',
        'spin-slow': 'spin-slow 3s linear infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'peek-once': 'peek 8s ease-in-out forwards',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-out': 'slideOut 0.3s ease-in',
        'shimmer': 'shimmer 2s infinite',
      },

      // ============================================
      // Z-INDEX SYSTEM
      // ============================================
      zIndex: {
        'hide': '-1',
        'auto': 'auto',
        'base': '0',
        'dropdown': '10',
        'sticky': '20',
        'fixed': '30',
        'overlay': '40',
        'modal': '50',
        'popover': '60',
        'tooltip': '70',
        'toast': '80',
        'max': '9999',
      },

      // ============================================
      // RING (FOCUS) SYSTEM
      // ============================================
      ringWidth: {
        'DEFAULT': '2px',
        '0': '0',
        '1': '1px',
        '2': '2px',
        '4': '4px',
      },
      ringOffsetWidth: {
        '0': '0',
        '1': '1px',
        '2': '2px',
        '4': '4px',
      },
    },
  },
  plugins: [
    // Custom scrollbar hiding utility
    function({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        },
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
          '&::-webkit-scrollbar': {
            width: '6px',
            height: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#D4D4D4',
            borderRadius: '3px'
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#A3A3A3'
          }
        }
      })
    },
    // Interactive state utilities
    function({ addUtilities }) {
      addUtilities({
        '.focus-ring': {
          '&:focus-visible': {
            outline: 'none',
            '--tw-ring-offset-width': '2px',
            '--tw-ring-offset-color': '#fff',
            '--tw-ring-color': '#6A469D',
            'box-shadow': '0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color), 0 0 0 calc(var(--tw-ring-offset-width) + 2px) var(--tw-ring-color)'
          }
        },
        '.focus-ring-inset': {
          '&:focus-visible': {
            outline: 'none',
            '--tw-ring-color': '#6A469D',
            'box-shadow': 'inset 0 0 0 2px var(--tw-ring-color)'
          }
        }
      })
    }
  ],
}
