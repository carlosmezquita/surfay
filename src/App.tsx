import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const MapPage = lazy(() => import('./pages/MapPage').then((module) => ({ default: module.MapPage })))
const SpotDetailPage = lazy(() =>
  import('./pages/SpotDetailPage').then((module) => ({ default: module.SpotDetailPage })),
)
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))

function RouteFallback() {
  return (
    <main className="route-skeleton" aria-label="Loading forecast">
      <span />
      <div />
      <div />
    </main>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/spots/:slug" element={<SpotDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
