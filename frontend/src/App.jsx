import { lazy, Suspense } from 'react'

const PortalApp = lazy(() => import('./Portal'))

export default function App() {
  return (
    <Suspense fallback={<main className="app-loading" aria-label="Loading portal">Loading portal…</main>}>
      <PortalApp />
    </Suspense>
  )
}
