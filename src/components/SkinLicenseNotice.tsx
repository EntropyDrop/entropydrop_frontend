import type { LangData } from '../constants/lang'
import type { LicensePreview, SourceRights } from '../hooks/useSkinLicensePolicy'

export function SkinLicenseNotice({ current, code, isPublic, publicLicense }: {
    current: LangData
    code: LicensePreview
    isPublic?: boolean
    publicLicense?: 'cc-by-nc-4.0' | null
}) {
    const copy = current.skinLicense
    const [label, description] = code === 'entropydrop-commercial-1.0' ? [copy.commercial, copy.commercialDescription]
        : code === 'original-work' ? [copy.original, copy.originalDescription]
        : code === 'source-license' ? [copy.source, copy.sourceDescription]
        : code === 'cc-by-nc-4.0' ? [copy.nonCommercial, copy.nonCommercialDescription]
        : code === 'loading' ? [copy.loading, '']
        : code === 'unavailable' ? [copy.unavailable, copy.unavailableDescription]
        : [copy.unknown, copy.unknownDescription]
    return <div className={`border border-white/15 bg-white/[0.03] p-3 flex flex-col gap-2 text-xs ${current.fontClass}`}>
        <p className="m-0 text-white/80">{copy.yourRights}: <strong className="text-white">{label}</strong></p>
        {description && <p className="m-0 text-white/55 leading-relaxed" role={code === 'unavailable' ? 'alert' : undefined}>{description}</p>}
        <p className="m-0 text-white/80">{copy.sharing}: {isPublic === undefined ? copy.sharingChoice
            : isPublic ? (publicLicense === null ? copy.publicUnknown : copy.publicSharing) : copy.privateSharing}</p>
        {(isPublic || publicLicense === 'cc-by-nc-4.0') && publicLicense !== null && <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">{copy.terms}</a>}
        {isPublic === false && publicLicense === 'cc-by-nc-4.0' && <p className="m-0 text-amber-300/80">{copy.previousPublic}</p>}
    </div>
}

export function SourceRightsField({ current, value, onChange }: {
    current: LangData; value: SourceRights; onChange: (value: SourceRights) => void
}) {
    return <label className={`flex flex-col gap-2 text-xs text-white/70 ${current.fontClass}`}>
        <span>{current.skinLicense.sourceTitle}</span>
        <select value={value} onChange={event => onChange(event.target.value as SourceRights)} className="border border-white/20 bg-[#1a1a1a] p-2 text-white">
            <option value="external">{current.skinLicense.externalSource}</option>
            <option value="original">{current.skinLicense.originalSource}</option>
        </select>
        <span className="text-white/50 leading-relaxed">{current.skinLicense.sourceHint}</span>
    </label>
}

export function PublicLicenseConsent({ current, checked, onChange }: {
    current: LangData; checked: boolean; onChange: (checked: boolean) => void
}) {
    return <label className={`flex items-start gap-2 text-xs text-white/65 leading-relaxed cursor-pointer ${current.fontClass}`}>
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 accent-[#4ea632] shrink-0" />
        <span>{current.skinLicense.publicConsent}</span>
    </label>
}
