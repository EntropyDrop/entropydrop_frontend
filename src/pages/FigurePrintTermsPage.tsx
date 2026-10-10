import { Link } from 'react-router-dom'
import { SEO } from '../components/SEO'
import { FIGURE_PRINT_TERMS } from '../constants/figurePrintTerms'
import type { LangData } from '../constants/lang'

export function FigurePrintTermsPage({ current }: { current: LangData }) {
    const t = current.figurePrintTerms
    return <main className="fixed inset-0 overflow-y-auto bg-white text-black font-sans">
        <article className="p-6 sm:p-16 pb-24 max-w-4xl mx-auto leading-relaxed">
            <h1 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">{t.title}</h1>
            <p className="text-sm text-gray-600 mb-8">{t.versionLabel} {FIGURE_PRINT_TERMS.version} · {t.effectiveDateLabel} <time dateTime={FIGURE_PRINT_TERMS.effectiveDate}>{FIGURE_PRINT_TERMS.effectiveDate}</time></p>
            <SEO title={t.title} description={t.summary} />
            <p className="border-l-4 border-amber-600 bg-amber-50 p-4 mb-10 font-medium">{t.summary}</p>
            <div className="space-y-8">
                {t.sections.map(section => <section key={section.title}>
                    <h2 className="text-xl font-bold mb-3">{section.title}</h2>
                    <p className="text-gray-800 whitespace-pre-wrap">{section.content}</p>
                </section>)}
            </div>
            <footer className="mt-12 pt-6 border-t border-gray-200 flex flex-wrap gap-6 text-sm">
                <Link to="/skin/tos" className="text-blue-700 underline underline-offset-4">{current.termsOfService.title}</Link>
                <Link to="/skin/privacy" className="text-blue-700 underline underline-offset-4">{current.privacyPolicy.title}</Link>
                <Link to="/figure/3dprint" className="text-blue-700 underline underline-offset-4">{t.backToPrint}</Link>
                <a href="mailto:support@entropydrop.com" className="text-blue-700 underline underline-offset-4">support@entropydrop.com</a>
            </footer>
        </article>
    </main>
}
