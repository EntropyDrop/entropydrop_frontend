import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingPlaceholder } from './components/LoadingPlaceholder'
import { type LangKey, type LangData, loadLangData, SUPPORTED_LANGUAGES } from './constants/lang'

// Lazy load pages
const CollectionPage = lazy(() => import('./pages/CollectionPage').then(m => ({ default: m.CollectionPage })))
const GeneratePage = lazy(() => import('./pages/GeneratePage').then(m => ({ default: m.GeneratePage })))
const EditPage = lazy(() => import('./pages/EditPage').then(m => ({ default: m.EditPage })))
const PrintPage = lazy(() => import('./pages/PrintPage').then(m => ({ default: m.PrintPage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })))
const ProPage = lazy(() => import('./pages/ProPage').then(m => ({ default: m.ProPage })))
const PublicPage = lazy(() => import('./pages/PublicPage').then(m => ({ default: m.PublicPage })))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })))
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })))
const ArticlePage = lazy(() => import('./pages/ArticlePage').then(m => ({ default: m.ArticlePage })))
const MonitorPage = lazy(() => import('./pages/MonitorPage').then(m => ({ default: m.MonitorPage })))
const FinancialsPage = lazy(() => import('./pages/FinancialsPage').then(m => ({ default: m.FinancialsPage })))
const FixedAssetsPage = lazy(() => import('./pages/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })))
const LedgerPage = lazy(() => import('./pages/LedgerPage').then(m => ({ default: m.LedgerPage })))
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage').then(m => ({ default: m.DiscoveryPage })))
const FigurePage = lazy(() => import('./pages/FigurePage').then(m => ({ default: m.FigurePage })))


/**
 * Get the system's current language and map it to our LangKey
 */
const getSystemLang = (): LangKey => {
  const fullLang = navigator.language.toLowerCase()
  if (fullLang.startsWith('zh')) return 'zh-hans'
  return 'en'
}

const getStoredIsAuto = (): boolean => {
  const stored = localStorage.getItem('isAuto')
  return stored !== null ? JSON.parse(stored) : true
}

function LegacyOpenRedirect() {
  const location = useLocation()
  const target = `${location.pathname.replace(/^\/skin\/open/, '/public')}${location.search}${location.hash}`
  return <Navigate to={target} replace />
}

function AppContent({ currentLangData, lang, setLang, isAuto, setIsAuto }: {
  currentLangData: LangData,
  lang: LangKey,
  setLang: (l: LangKey) => void,
  isAuto: boolean,
  setIsAuto: (a: boolean) => void
}) {
  const location = useLocation()
  const isPolicyPage = ['/skin/privacy', '/skin/tos'].includes(location.pathname)

  const routes = (
    <Suspense fallback={<LoadingPlaceholder current={currentLangData} />}>
      <Routes>
        <Route path="/" element={<Navigate to="/skin/" replace />} />
        <Route path="/skin/" element={<DiscoveryPage current={currentLangData} />} />
        <Route path="/skin/generate" element={<GeneratePage current={currentLangData} />} />
        <Route path="/skin/edit" element={<EditPage current={currentLangData} />} />
        <Route path="/skin/print" element={<PrintPage current={currentLangData} />} />
        <Route path="/skin/collection" element={<CollectionPage current={currentLangData} />} />
        <Route path="/skin/collection/:userId" element={<CollectionPage current={currentLangData} />} />
        <Route path="/skin/collection/:userId/:collectionId" element={<CollectionPage current={currentLangData} />} />
        <Route path="/skin/orders" element={<OrdersPage current={currentLangData} />} />
        <Route path="/pro" element={<ProPage current={currentLangData} />} />
        <Route path="/public" element={<PublicPage current={currentLangData} />} />
        <Route path="/public/article/:id" element={<ArticlePage current={currentLangData} />} />
        <Route path="/skin/privacy" element={<PrivacyPolicyPage current={currentLangData} />} />
        <Route path="/skin/tos" element={<TermsOfServicePage current={currentLangData} />} />
        <Route path="/skin/monitor" element={<MonitorPage current={currentLangData} />} />
        <Route path="/public/financials" element={<FinancialsPage current={currentLangData} />} />
        <Route path="/public/fixed-assets" element={<FixedAssetsPage current={currentLangData} />} />
        <Route path="/public/ledger" element={<LedgerPage current={currentLangData} />} />
        <Route path="/skin/open/*" element={<LegacyOpenRedirect />} />
        <Route path="/figure" element={<FigurePage current={currentLangData} />} />
      </Routes>
    </Suspense>
  )

  if (isPolicyPage) {
    return routes
  }

  return (
    <Layout lang={lang} setLang={setLang} isAuto={isAuto} setIsAuto={setIsAuto} current={currentLangData}>
      {routes}
    </Layout>
  )
}

function App() {
  const [isAuto, setIsAuto] = useState<boolean>(getStoredIsAuto)

  const [lang, setLang] = useState<LangKey>(() => {
    if (getStoredIsAuto()) {
      return getSystemLang()
    }

    const stored = localStorage.getItem('lang')
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as LangKey
    }
    return getSystemLang()
  })

  const [currentLangData, setCurrentLangData] = useState<LangData | null>(null)

  useEffect(() => {
    localStorage.setItem('isAuto', JSON.stringify(isAuto))
  }, [isAuto])

  useEffect(() => {
    localStorage.setItem('lang', lang)
  }, [lang])

  useEffect(() => {
    let active = true
    const loadData = async () => {
      const data = await loadLangData(lang)
      if (active) setCurrentLangData(data)
    }
    loadData()
    return () => {
      active = false
    }
  }, [lang])

  if (!currentLangData) {
    return <LoadingPlaceholder />
  }

  const handleSetIsAuto = (auto: boolean) => {
    setIsAuto(auto)
    if (auto) {
      setLang(getSystemLang())
    }
  }

  return (
    <BrowserRouter>
      <AppContent
        currentLangData={currentLangData}
        lang={lang}
        setLang={setLang}
        isAuto={isAuto}
        setIsAuto={handleSetIsAuto}
      />
    </BrowserRouter>
  )
}

export default App
