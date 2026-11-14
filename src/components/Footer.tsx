import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import {
    type LangData,
    type LangKey,
    SUPPORTED_LANGUAGES,
    LANGUAGE_LABELS,
    getSystemLang,
} from '../constants/lang'
import { useLanguage } from '../context/LanguageContext'

export interface FooterProps {
    current: LangData
    lang?: LangKey
    setLang?: (l: LangKey) => void
    isAuto?: boolean
    setIsAuto?: (a: boolean) => void
}

export function Footer({
    current,
    lang: propLang,
    setLang: propSetLang,
    isAuto: propIsAuto,
    setIsAuto: propSetIsAuto,
}: FooterProps) {
    const data = current.home.footer
    const fontClass = current.fontClass || 'font-pixel-hans'
    const currentYear = new Date().getFullYear()

    const langCtx = useLanguage()
    const storedLang = typeof localStorage !== 'undefined' ? (localStorage.getItem('lang') as LangKey | null) : null
    const lang: LangKey = propLang ?? langCtx?.lang ?? (storedLang || 'zh-hans')
    const storedIsAuto = typeof localStorage !== 'undefined' ? localStorage.getItem('isAuto') === 'true' : false
    const isAuto: boolean = propIsAuto ?? langCtx?.isAuto ?? storedIsAuto
    const setLang = propSetLang ?? langCtx?.setLang
    const setIsAuto = propSetIsAuto ?? langCtx?.setIsAuto

    const handleLangChange = (val: string) => {
        if (val === 'auto') {
            if (setIsAuto) {
                setIsAuto(true)
            } else {
                if (typeof localStorage !== 'undefined') localStorage.setItem('isAuto', 'true')
                if (setLang) setLang(getSystemLang())
            }
        } else {
            if (setIsAuto) {
                setIsAuto(false)
            } else {
                if (typeof localStorage !== 'undefined') localStorage.setItem('isAuto', 'false')
            }
            if (setLang) {
                setLang(val as LangKey)
            } else {
                if (typeof localStorage !== 'undefined') localStorage.setItem('lang', val)
            }
        }
    }

    return (
        <footer className={`w-full pt-6 pb-4 text-xs text-white/50 border-t border-white/10 ${fontClass}`}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Brand & Contact */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <span>© {currentYear} EntropyDrop LLC</span>
                    <span className="text-white/20 hidden sm:inline">·</span>
                    <a
                        href={`mailto:${data.contact.emailAddress}`}
                        className="text-white/50 hover:text-white transition-colors no-underline inline-flex items-center gap-1.5"
                    >
                        <Icon icon="pixelarticons:mail" className="text-xs text-white/40" />
                        <span>{data.contact.emailAddress}</span>
                    </a>
                </div>

                {/* Navigation, Legal Links & Language Settings */}
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
                    <Link
                        to="/public"
                        className="text-white/50 hover:text-white transition-colors no-underline"
                    >
                        {data.links.aboutUs}
                    </Link>
                    <span className="text-white/20">·</span>
                    <Link
                        to="/skin/tos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 hover:text-white transition-colors no-underline"
                    >
                        {data.links.termsOfService}
                    </Link>
                    <span className="text-white/20">·</span>
                    <Link
                        to="/skin/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 hover:text-white transition-colors no-underline"
                    >
                        {data.links.privacyPolicy}
                    </Link>
                    <span className="text-white/20">·</span>
                    <Link
                        to="/skin/refund-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 hover:text-white transition-colors no-underline"
                    >
                        {data.links.refundPolicy}
                    </Link>
                    <span className="text-white/20">·</span>
                    {/* Language Settings */}
                    <div className="inline-flex items-center gap-1.5 text-white/50 hover:text-white transition-colors">
                        <Icon icon="pixelarticons:globe" className="text-xs text-white/40 shrink-0" />
                        <label htmlFor="footer-language-select" className="sr-only">
                            {current.user.language}
                        </label>
                        <select
                            id="footer-language-select"
                            value={isAuto ? 'auto' : lang}
                            onChange={(e) => handleLangChange(e.target.value)}
                            className={`bg-transparent hover:bg-white/5 border border-white/10 hover:border-white/20 text-white/70 hover:text-white px-2 py-0.5 text-xs focus:outline-none focus:border-green-500/40 cursor-pointer transition-colors ${fontClass}`}
                        >
                            <option value="auto" className="bg-[#1a1a1a] text-white">
                                {current.common.auto}
                            </option>
                            {SUPPORTED_LANGUAGES.map((lk) => (
                                <option key={lk} value={lk} className="bg-[#1a1a1a] text-white">
                                    {LANGUAGE_LABELS[lk]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            <p className="m-0 mt-4 text-center text-[10px] uppercase tracking-wide text-white/30">{data.disclaimer}</p>
        </footer>
    )
}
