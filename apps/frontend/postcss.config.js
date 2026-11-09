import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// @anchor app-zoom-viewport-units — CSS `zoom` na <html> (`app-zoom`) mnoży też vh/vw, więc `100vh` wychodziłoby
// większe niż ekran; każda taka wartość jest dzielona przez bieżącą skalę. Wartości vh/vw w stylach inline w JSX
// trzeba zapisywać tak samo: `calc(90vh / var(--app-zoom, 1))`.
const VIEWPORT_UNIT = /(?<![\w#])(-?\d*\.?\d+(?:s|l|d)?(?:vh|vw|vmin|vmax))\b/g
const appZoomViewportUnits = {
  postcssPlugin: 'app-zoom-viewport-units',
  OnceExit(root) {
    root.walkDecls((decl) => {
      if (decl.value.includes('--app-zoom') || decl.value.includes('url(')) return
      decl.value = decl.value.replace(VIEWPORT_UNIT, 'calc($1 / var(--app-zoom, 1))')
    })
  },
}

export default {
  plugins: [tailwindcss, autoprefixer, appZoomViewportUnits],
}
