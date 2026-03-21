
/** @type {import('tailwindcss').Config} */
export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#FAFAFA',       // Near-white, clean
          sidebar: '#F4F4F5',  // Zinc-100 — cooler, more professional
          accent: '#18181B',   // Zinc-900 — near-black primary CTA
          text: '#18181B',     // Zinc-900 — strong, confident
          subtext: '#71717A',  // Zinc-500 — cool gray
          border: '#E4E4E7',   // Zinc-200 — subtle, clean
          user: '#F1F1F4',     // Slightly off-white for user messages
        }
      },
      fontFamily: {
        serif: ['"Crimson Pro"', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': '#18181B',
            '--tw-prose-headings': '#18181B',
            '--tw-prose-lead': '#71717A',
            '--tw-prose-links': '#18181B',
            '--tw-prose-bold': '#18181B',
            '--tw-prose-counters': '#71717A',
            '--tw-prose-bullets': '#71717A',
            '--tw-prose-hr': '#E4E4E7',
            '--tw-prose-quotes': '#18181B',
            '--tw-prose-quote-borders': '#E4E4E7',
            '--tw-prose-captions': '#71717A',
            '--tw-prose-code': '#18181B',
            '--tw-prose-pre-code': '#18181B',
            '--tw-prose-pre-bg': '#F4F4F5',
            '--tw-prose-th-borders': '#E4E4E7',
            '--tw-prose-td-borders': '#E4E4E7',
          },
        },
      },
      boxShadow: {
        'elevation-0': 'none',
        'elevation-1': '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'elevation-2': '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.04)',
        'elevation-3': '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)',
        'input-focus': '0 0 0 3px rgba(24,24,27,0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
