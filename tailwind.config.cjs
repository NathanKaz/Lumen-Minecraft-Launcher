/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)'
        },
        mint: {
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)'
        },
        iris: {
          400: 'rgb(var(--iris-400) / <alpha-value>)',
          500: 'rgb(var(--iris-500) / <alpha-value>)',
          600: 'rgb(var(--iris-600) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 32px rgba(52, 211, 153, 0.22)',
        'glow-iris': '0 0 32px rgba(139, 92, 246, 0.25)',
        panel: '0 18px 50px rgba(0, 0, 0, 0.45)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite'
      }
    }
  },
  plugins: []
}
