import { type LangData } from '../constants/lang'

interface PrivacyPolicyPageProps {
    current: LangData
}

export function PrivacyPolicyPage({ current }: PrivacyPolicyPageProps) {
    const data = current.privacyPolicy;

    return (
        <div className="fixed inset-0 overflow-y-auto bg-white">
            <div className="text-black p-8 sm:p-16 max-w-4xl mx-auto font-sans leading-relaxed pb-32">
                <h1 className="text-4xl font-black mb-12 tracking-tight">
                    {data.title}
                </h1>

                <div className="flex flex-col gap-10">
                    {data.sections.map((sec: any, index: number) => (
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
                    <p className="mt-2 italic">Last updated: {new Date().toLocaleDateString()}</p>
                </footer>
            </div>
        </div>
    );
}
