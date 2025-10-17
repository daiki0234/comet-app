/** @type {import('tailwindcss').Config} */
module.exports = {
  // contentの配列に、スタイルが使われている可能性のある全てのフォルダを指定します
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}", // この行が login や dashboard などをカバーします
  ],
  theme: {
    extend: {
      colors: {
        'ios-blue': '#007AFF',
        'ios-gray': {
          100: '#F2F2F7',
          200: '#E5E5EA',
        },
      },
      borderRadius: {
        'ios': '10px',
      },
      boxShadow: {
        'ios': '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};