/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070910',
          900: '#0B0E14',
          850: '#0F131C',
          800: '#151A24',
          700: '#1C2230',
          600: '#262E40'
        },
        mint: {
          300: '#A7F3D0',
          400: '#6EE7A8',
          500: '#34D399',
          600: '#10B981'
        },
        iris: {
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED'
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
