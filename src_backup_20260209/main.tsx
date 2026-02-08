import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './globals.css'
import App from './App'

// Sentry hata takibi - production'da hataları yakalar
Sentry.init({
  dsn: "https://31baab3008ea06fc0e886e89e58c2872@o4510839165353984.ingest.de.sentry.io/4510839169351760",
  environment: import.meta.env.MODE, // "production" veya "development"
  enabled: import.meta.env.PROD, // Sadece production'da aktif
  tracesSampleRate: 0.2, // %20 performance trace (maliyeti düşük tutar)
  replaysSessionSampleRate: 0, // Replay kapalı (ücretsiz plan için)
  replaysOnErrorSampleRate: 0.5, // Hata olduğunda %50 replay
})

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
