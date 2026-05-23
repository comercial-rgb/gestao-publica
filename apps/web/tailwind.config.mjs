/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Display: serif editorial (Fraunces). Body: sans humanista (Spectral / Source Sans).
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Paleta institucional sóbria — verde governo + areia + carvão
        carvao: {
          50:  '#f6f6f5',
          100: '#e7e7e4',
          200: '#cfcfca',
          300: '#aeaea7',
          400: '#878781',
          500: '#6c6c66',
          600: '#565651',
          700: '#464642',
          800: '#3b3b38',
          900: '#252523',
        },
        verde: {
          50:  '#f0f5ee',
          100: '#dceadb',
          200: '#bbd5b8',
          300: '#94ba90',
          400: '#719c6d',
          500: '#5a8556',
          600: '#456a42',
          700: '#385435',
          800: '#2f422d',
          900: '#283626',
        },
        areia: {
          50:  '#faf8f3',
          100: '#f3eee2',
          200: '#e7dcc3',
          300: '#d7c79e',
          400: '#c4ad7a',
          500: '#b09660',
          600: '#967c51',
          700: '#7a6342',
          800: '#65523a',
          900: '#544432',
        },
      },
      boxShadow: {
        card: '0 1px 0 rgba(37, 37, 35, 0.04), 0 4px 16px -8px rgba(37, 37, 35, 0.12)',
      },
    },
  },
  plugins: [],
}
