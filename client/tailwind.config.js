export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        party: {
          pink: '#ff3ea5',
          purple: '#7c3aed',
          yellow: '#ffd60a',
          teal: '#06d6a0',
          orange: '#ff6b35',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
