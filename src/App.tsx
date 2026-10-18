import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  AccountPageSkeleton,
  MapPageSkeleton,
  SpotRouteSkeleton,
} from './features/loading/PublicPageSkeletons'

const MapPage = lazy(() =>
  import('./pages/MapPage').then((module) => ({ default: module.MapPage })),
)
const SpotDetailPage = lazy(() =>
  import('./pages/SpotDetailPage').then((module) => ({ default: module.SpotDetailPage })),
)
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })),
)
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })),
)

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/map" replace />} />
      <Route
        path="/map"
        element={
          <Suspense fallback={<MapPageSkeleton />}>
            <MapPage />
          </Suspense>
        }
      />
      <Route
        path="/spots/:slug"
        element={
          <Suspense fallback={<SpotRouteSkeleton />}>
            <SpotDetailPage />
          </Suspense>
        }
      />
      <Route
        path="/account"
        element={
          <Suspense fallback={<AccountPageSkeleton />}>
            <AccountPage />
          </Suspense>
        }
      />
      <Route
        path="/admin"
        element={
          <Suspense
            fallback={
              <div className="admin-auth-state">
                <div className="admin-auth-skeleton" />
              </div>
            }
          >
            <AdminPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  )
}

export default App
