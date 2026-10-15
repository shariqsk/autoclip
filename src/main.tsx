import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { startAutosave } from './state/persist'

startAutosave()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// A handle for poking at the app from the browser console during development.
if (import.meta.env.DEV) {
  void Promise.all([import('./state/store'), import('./state/playhead'), import('./state/actions')]).then(([store, ph, actions]) => {
    Object.assign(window, { autoclip: { ...store, ...actions, playhead: ph.playhead } })
  })
}
