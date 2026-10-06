import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { DiscoveryBackground } from '../components/DiscoveryBackground'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder'
import { SEO } from '../components/SEO'
import { useAuthSession } from '../hooks/useAuthSession'
import { useDiscoverySelection } from './discovery/useDiscoverySelection'
import { useDiscoverySearch } from './discovery/useDiscoverySearch'
import { DiscoveryListView } from './discovery/DiscoveryListView'
import type { GenerationLogItem } from '../types/log'
import type { LangData } from '../constants/lang'

const DiscoverySearch = lazy(() => import('../components/DiscoverySearch').then(module => ({ default: module.DiscoverySearch })))
const MCModal = lazy(() => import('../components/MCModal').then(module => ({ default: module.MCModal })))

export function DiscoveryPage({ current }: { current: LangData }) {
    const navigate = useNavigate()
    const { view, selected, select, setView } = useDiscoverySelection()
    const search = useDiscoverySearch(view, current)
    const authSession = useAuthSession()
    const [isLoading, setIsLoading] = useState(false)
    const closeModal = () => {
        const id = selected?.id
        select(null)
        if (id) void search.refreshItem(id)
    }
    return <>
        <SEO title={current.nav.discover} description={current.subtitle} />
        {view === '3d' ? <>
            <div className="absolute inset-0 z-0">
                <DiscoveryBackground fallback={null} selected={selected} onSelect={select} onLoading={setIsLoading} paused={selected !== null || search.isOpen} />
            </div>
            {isLoading && <LoadingPlaceholder current={current} className="top-24 sm:top-28 z-20" />}
            <div className="absolute top-16 right-4 sm:top-auto sm:bottom-8 sm:right-8 z-30 pointer-events-auto">
                <button onClick={() => setView('list')} className={`px-3 py-1.5 bg-black/60 backdrop-blur-md hover:bg-black/85 text-white border border-white/10 flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${current.fontClass}`}>
                    <Icon icon="pixelarticons:list" className="text-base" /><span>{current.discovery.modeList}</span>
                </button>
            </div>
            {authSession && <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto shadow-2xl">
                <Suspense fallback={null}><DiscoverySearch current={current} search={search} onSelect={select} selectedItem={selected} /></Suspense>
            </div>}
        </> : <DiscoveryListView current={current} search={search} selectedItem={selected} onSelect={select} onView3D={() => setView('3d')} />}
        {selected && <Suspense fallback={<LoadingPlaceholder current={current} />}>
            <MCModal key={selected.id} item={selected as GenerationLogItem} textureUrl={selected.result} current={current} closeModal={closeModal}
                onEdit={(textureUrl, passedLogId, isPublic) => navigate('/skin/edit', { state: { textureUrl, passedLogId, isPublic } })}
                onAiEdit={(sourceImage, sourceId, isPublic) => navigate('/skin/generate', { state: { sourceImage, sourceId, mode: 'aigc_image_edit_to_skin', isPublic } })}
                onItemSelect={id => select({ id, result: '', is_public: true, prompt: '' })} />
        </Suspense>}
    </>
}
