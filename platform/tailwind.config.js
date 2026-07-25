/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f1f3f5',
        },
        sidebar: {
          bg: '#1a1b2e',
          hover: '#252640',
          active: '#2e2f4a',
          text: '#a0a3bd',
          'text-active': '#ffffff',
        },
        txt: {
          primary: '#212529',
          secondary: '#495057',
          muted: '#868e96',
        },
        border: {
          DEFAULT: '#dee2e6',
          light: '#e9ecef',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': '#212529',
            '--tw-prose-headings': '#212529',
            '--tw-prose-links': '#4263eb',
            '--tw-prose-code': '#212529',
            '--tw-prose-pre-code': '#e9ecef',
            '--tw-prose-pre-bg': '#1a1b2e',
          },
        },
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
