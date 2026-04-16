/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{html,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0f0f14',
          800: '#16161f',
          700: '#1e1e2a',
          600: '#26263a',
          500: '#32324a'
        }
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'blink': 'blink 1s step-end infinite'
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '80%, 100%': { transform: 'scale(2)', opacity: '0' }
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        }
      }
    }
  },
  plugins: []
}
