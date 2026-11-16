import { bootstrapAuthSession } from './utils/authClient'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { addCollection } from '@iconify/react'
import './index.css'
import App from './App.tsx'
import pixelarticons from './icons/pixelarticons'

// Load Umami Analytics dynamically if configured (privacy-friendly, cookieless analytics)
const umamiWebsiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID
const umamiScriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js'
if (umamiWebsiteId) {
  const script = document.createElement('script')
  script.defer = true
  script.src = umamiScriptUrl
  script.setAttribute('data-website-id', umamiWebsiteId)
  document.head.appendChild(script)
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
