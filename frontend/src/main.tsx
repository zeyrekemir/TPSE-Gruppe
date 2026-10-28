import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
// Fonts are served from our own server (not Google Fonts): visitors' addresses go to no third party.
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/unbounded/700.css'
import '@fontsource/unbounded/900.css'
import './index.css'
import App from './App'

// The welcome story is scroll-driven and must start at the top, also after a reload.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
