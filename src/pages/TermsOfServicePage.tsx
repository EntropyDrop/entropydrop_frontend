import { useEffect } from 'react'
import { type LangData } from '../constants/lang'
import { useLocation } from 'react-router-dom'
import { FIGURE_PRINT_TERMS, TERMS_OF_SERVICE_VERSION } from '../constants/figurePrintTerms'

interface TermsOfServicePageProps {
    current: LangData
}

export function TermsOfServicePage({ current }: TermsOfServicePageProps) {
    const data = current.termsOfService;
    const printTerms = current.figurePrintTerms;
    const { hash } = useLocation();

    // The page scrolls inside a fixed container, so honor #anchors (e.g. the 3D printing section) ourselves.
    useEffect(() => {
        if (!hash) return;
        let id = hash.slice(1);
        try { id = decodeURIComponent(id); } catch { /* keep the raw id */ }
        document.getElementById(id)?.scrollIntoView();
    }, [hash]);

    return (
        <div className="fixed inset-0 overflow-y-auto bg-white">
            <div className="text-black p-8 sm:p-16 max-w-4xl mx-auto font-sans leading-relaxed pb-32">
                <h1 className="text-4xl font-black mb-4 tracking-tight">
                    {data.title}
                </h1>
                <p className="text-sm text-gray-600 mb-8">{current.figurePrintTerms.versionLabel} {TERMS_OF_SERVICE_VERSION} · {current.figurePrintTerms.effectiveDateLabel} <time dateTime={TERMS_OF_SERVICE_VERSION}>{TERMS_OF_SERVICE_VERSION}</time></p>
                <div className="flex flex-col gap-10">
                    {data.sections.map((sec, index) => (
                        <div key={index}>
                            <h2 className="text-xl font-bold mb-4">{sec.title}</h2>
                            <p className="text-gray-800 whitespace-pre-wrap text-base">
                                {sec.content}
                            </p>
                        </div>
                    ))}
                    <section id={FIGURE_PRINT_TERMS.anchor} className="scroll-mt-8">
                        <h2 className="text-xl font-bold mb-4">{printTerms.sectionTitle}</h2>
                        <div className="flex flex-col gap-6">
                            {printTerms.sections.map(section => (
                                <div key={section.title}>
                                    <h3 className="text-lg font-bold mb-2">{section.title}</h3>
                                    <p className="text-gray-800 whitespace-pre-wrap text-base">{section.content}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <footer className="mt-20 pt-8 border-t border-gray-200 text-sm text-gray-500">
                    <p>© {new Date().getFullYear()} EntropyDrop LLC • All Rights Reserved</p>
                    <p className="mt-2 italic">{data.lastUpdatedLabel}: {data.lastUpdated}</p>
                </footer>
            </div>
        </div>
    );
}
