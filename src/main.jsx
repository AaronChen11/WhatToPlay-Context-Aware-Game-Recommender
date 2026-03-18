import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (import.meta.env.DEV) {
  const suppressedWarnings = [
    'THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.',
  ]

  const originalWarn = console.warn
  console.warn = (...args) => {
    const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')
    if (suppressedWarnings.some((warning) => message.includes(warning))) return
    originalWarn(...args)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
