import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import type { LangData } from '../constants/lang'

interface FooterProps {
    current: LangData
}

export function Footer({ current }: FooterProps) {
    const data = current.home.footer
    const fontClass = current.fontClass || 'font-pixel-hans'
    const currentYear = new Date().getFullYear()

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

                {/* Navigation & Legal Links */}
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
                </div>
            </div>
            <p className="m-0 mt-4 text-center text-[10px] uppercase tracking-wide text-white/30">{data.disclaimer}</p>
        </footer>
    )
}
