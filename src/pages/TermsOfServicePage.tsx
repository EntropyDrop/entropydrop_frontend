import { type LangData } from '../constants/lang'
import { Link } from 'react-router-dom'
import { FIGURE_PRINT_TERMS, TERMS_OF_SERVICE_VERSION } from '../constants/figurePrintTerms'

interface TermsOfServicePageProps {
    current: LangData
}

export function TermsOfServicePage({ current }: TermsOfServicePageProps) {
    const data = current.termsOfService;

    return (
        <div className="fixed inset-0 overflow-y-auto bg-white">
            <div className="text-black p-8 sm:p-16 max-w-4xl mx-auto font-sans leading-relaxed pb-32">
                <h1 className="text-4xl font-black mb-4 tracking-tight">
                    {data.title}
                </h1>
                <p className="text-sm text-gray-600 mb-8">{current.figurePrintTerms.versionLabel} {TERMS_OF_SERVICE_VERSION} · {current.figurePrintTerms.effectiveDateLabel} <time dateTime={FIGURE_PRINT_TERMS.effectiveDate}>{FIGURE_PRINT_TERMS.effectiveDate}</time></p>
                <section className="border border-amber-200 bg-amber-50 p-5 mb-10">
                    <h2 className="text-xl font-bold mb-3">{data.additionalServices.title}</h2>
                    <p className="whitespace-pre-wrap text-gray-800">{data.additionalServices.content}</p>
                    <Link to={FIGURE_PRINT_TERMS.path} className="inline-block mt-4 text-blue-700 underline underline-offset-4">{current.figurePrintTerms.title} · {current.figurePrintTerms.versionLabel} {FIGURE_PRINT_TERMS.version} · {current.figurePrintTerms.effectiveDateLabel} {FIGURE_PRINT_TERMS.effectiveDate}</Link>
                </section>
                <div className="flex flex-col gap-10">
                    {data.sections.map((sec, index) => (
                        <div key={index}>
                            <h2 className="text-xl font-bold mb-4">{sec.title}</h2>
                            <p className="text-gray-800 whitespace-pre-wrap text-base">
                                {sec.content}
                            </p>
                        </div>
                    ))}
                </div>

                <footer className="mt-20 pt-8 border-t border-gray-200 text-sm text-gray-500">
                    <p>© {new Date().getFullYear()} EntropyDrop • All Rights Reserved</p>
                    <p className="mt-2 italic">{data.lastUpdatedLabel}: {data.lastUpdated}</p>
                </footer>
            </div>
        </div>
    );
}
