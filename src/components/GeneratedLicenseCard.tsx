import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { LangData } from '../constants/lang'
import type { LicensePreview } from '../hooks/useSkinLicensePolicy'

export function GeneratedLicenseCard({ current, code, isPublic, isPro, hasParent, onUpgrade }: {
    current: LangData
    code: LicensePreview
    isPublic: boolean
    isPro: boolean
    hasParent: boolean
    onUpgrade: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const copy = current.generate
    const commercial = code === 'entropydrop-commercial-1.0'
    const source = code === 'source-license' || code === 'original-work'
    const nonCommercial = code === 'cc-by-nc-4.0' || (source && isPublic)
    const label = commercial ? copy.licenseCommercial
        : nonCommercial ? copy.licenseNonCommercialBadge
        : source ? copy.licenseSource
        : code === 'loading' ? copy.licenseLoading
        : code === 'unavailable' ? copy.licenseUnavailable
        : copy.licenseUnknown
    const summary = commercial
        ? hasParent ? copy.licenseParentCommercialOwnerSummary : copy.licenseCommercialSummary
        : source ? isPublic ? current.mcmodal.publicNonCommercialSummary : copy.licenseSourceSummary
        : code === 'cc-by-nc-4.0'
            ? hasParent ? copy.licenseParentNonCommercialSummary : copy.licenseNonCommercialSummary
        : code === 'loading' ? copy.licenseLoading
        : code === 'unavailable' ? copy.licenseUnavailable
        : copy.licenseParentUnknownSummary
    const description = commercial
        ? hasParent ? copy.licenseParentCommercialOwnerDesc : copy.licenseCommercialDesc
        : source ? current.mcmodal.thirdPartyRightsNotice
        : code === 'cc-by-nc-4.0'
            ? hasParent ? copy.licenseParentNonCommercialDesc : copy.licenseNonCommercialDesc
        : code === 'loading' ? copy.licenseLoadingDesc
        : code === 'unavailable' ? copy.licenseUnavailableDesc
        : copy.licenseParentUnknownDesc
    const tone = commercial ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300'
        : nonCommercial ? 'border-blue-500/25 bg-blue-500/5 text-blue-300'
        : 'border-orange-500/25 bg-orange-500/5 text-orange-300'
    const badgeTone = commercial ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
        : nonCommercial ? 'border-blue-400/50 bg-blue-500/20 text-blue-300'
        : 'border-orange-400/50 bg-orange-500/20 text-orange-300'

    return <div className={`border p-3 flex flex-col gap-2 transition-colors ${tone}`}>
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-pixel-hans uppercase tracking-wider text-white/70 font-semibold">
                <Icon icon="pixelarticons:shield" className="text-sm shrink-0" />
                <span>{copy.licenseTitle}</span>
            </div>
            <span className={`text-xs font-pixel-hans px-2 py-0.5 border font-bold ${badgeTone}`}>{label}</span>
        </div>
        <p className="m-0 text-xs leading-relaxed text-white/90 font-pixel-hans">{summary}</p>
        {!isPro && !hasParent && code === 'cc-by-nc-4.0' && <button type="button" onClick={onUpgrade}
            className="pt-1.5 border-t border-white/5 flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 cursor-pointer font-pixel-hans transition-colors group text-left">
            <Icon icon="pixelarticons:zap" className="text-xs shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">{copy.licenseProUpgradeHint}</span>
        </button>}
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
            className="flex items-center justify-between text-xs text-white/50 hover:text-white/80 transition-colors pt-1.5 border-t border-white/5 cursor-pointer font-pixel-hans w-full text-left">
            <span>{expanded ? copy.licenseHideDetails : copy.licenseViewDetails}</span>
            <Icon icon={expanded ? 'pixelarticons:chevron-up' : 'pixelarticons:chevron-down'} className="text-sm shrink-0" />
        </button>
        {expanded && <div className="flex flex-col gap-2 overflow-hidden pt-1">
            <p className="m-0 text-xs leading-relaxed text-white/60 font-pixel-hans">{description}</p>
            {isPublic && commercial && <p className="m-0 text-[11px] leading-relaxed text-amber-300/80 font-pixel-hans">{copy.licensePublicNotice}</p>}
            {!isPublic && <p className="m-0 text-[11px] leading-relaxed text-white/50 font-pixel-hans">{copy.licensePrivateNotice}</p>}
            {(code === 'cc-by-nc-4.0' || (isPublic && (commercial || source))) && <a
                href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer"
                className="text-xs text-blue-300 hover:text-blue-200 font-pixel-hans underline underline-offset-2 flex items-center gap-1 w-fit">
                <Icon icon="pixelarticons:external-link" className="text-xs shrink-0" />
                <span>{copy.licenseTermsLink}</span>
            </a>}
        </div>}
    </div>
}
