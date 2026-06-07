import { PageContainer } from '../components/PageContainer';
import { useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { LoadingSpinner } from '../components/LoadingPlaceholder'

const ArticleMarkdown = lazy(() => import('../components/ArticleMarkdown').then(m => ({ default: m.ArticleMarkdown })))

interface ArticlePageProps {
    current: LangData
}

export function ArticlePage({ current }: ArticlePageProps) {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        const fetchArticle = async () => {
            setLoading(true)
            setError(false)
            try {
                // Try fetchingized localized version first, then fallback to default
                let response = await fetch(`/articles/${id}.${current.lang}.md`)
                if (!response.ok) {
                    response = await fetch(`/articles/${id}.md`)
                }

                if (response.ok) {
                    const text = await response.text()
                    setContent(text)
                } else {
                    setError(true)
                }
            } catch {
                setError(true)
            } finally {
                setLoading(false)
            }
        }

        if (id) fetchArticle()
    }, [id, current.lang])

    return (
        <PageContainer
            bg="bg-black/60 backdrop-blur-xl"
            animate="animate-in fade-in slide-in-from-bottom-4 duration-500"
            innerPadding="p-10"
        >

            {/* Navigation */}
            <button
                onClick={() => navigate('/public')}
                className="flex items-center gap-2 text-white/50 hover:text-green-500 transition-colors self-start group"
            >
                <Icon icon="pixelarticons:arrow-left" className="text-xl transform group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-mono uppercase tracking-widest">Back to Mission</span>
            </button>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <LoadingSpinner />
                    <span className="text-xs text-white/40 font-mono">LOADING_ARTICLE...</span>
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <Icon icon="pixelarticons:close-box" className="text-4xl text-red-500/40" />
                    <span className="text-sm text-white/60">Article not found or failed to load.</span>
                </div>
            ) : (
                <article className={`prose prose-invert max-w-none ${current.fontClass}`}>
                    <Suspense fallback={<div className="text-white/40 text-sm font-mono">RENDERING_ARTICLE...</div>}>
                        <ArticleMarkdown content={content} />
                    </Suspense>
                </article>
            )}
        </PageContainer>
    )
}
