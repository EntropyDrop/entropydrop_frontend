import { bootstrapAuthSession } from './utils/authClient'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { addCollection } from '@iconify/react'
import './index.css'
import App from './App.tsx'
import pixelarticons from './icons/pixelarticons'

// Load Google Analytics dynamically if configured
const gtagId = import.meta.env.VITE_GTAG_ID
if (gtagId) {
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gtagId}`
  document.head.appendChild(script)

  const dataLayer = window.dataLayer = window.dataLayer || []
  const gtag: NonNullable<Window['gtag']> = function () {
    // Keep Google's SDK queue format: https://developers.google.com/tag-platform/devguides/datalayer
    // eslint-disable-next-line prefer-rest-params -- gtag commands require IArguments rather than an Array.
    dataLayer.push(arguments)
  }
  ;window.gtag = gtag
  ;gtag('js', new Date())
  ;gtag('config', gtagId)
}

addCollection(pixelarticons)

// Handle ChunkLoadError / failed dynamic module imports after new deployments
window.addEventListener('vite:preloadError', () => {
  const reloaded = sessionStorage.getItem('chunk_reload');
  if (!reloaded) {
    sessionStorage.setItem('chunk_reload', 'true');
    window.location.reload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (
    event.reason.name === 'ChunkLoadError' ||
    (typeof event.reason.message === 'string' && (
      event.reason.message.includes('Failed to fetch dynamically imported module') ||
      event.reason.message.includes('Importing a module script failed')
    ))
  )) {
    const reloaded = sessionStorage.getItem('chunk_reload');
    if (!reloaded) {
      sessionStorage.setItem('chunk_reload', 'true');
      window.location.reload();
    }
  }
});

window.addEventListener('load', () => {
  sessionStorage.removeItem('chunk_reload');
});

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

renderApp()
void bootstrapAuthSession()
