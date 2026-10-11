import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/karla'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'
import { ForecastProvider } from './features/forecast/ForecastProvider.tsx'
import { LocaleProvider } from './features/i18n/LocaleProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ForecastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ForecastProvider>
    </LocaleProvider>
  </StrictMode>,
)
