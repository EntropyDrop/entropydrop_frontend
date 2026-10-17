import { useId, useState } from 'react'
import type { LangData } from '../constants/lang'
import type { CreatorOffer } from '../hooks/useCreatorQuote'

export function CreatorCodeField({ current, offer, disabled, busy, error, onApply }: {
    current: LangData; offer?: CreatorOffer | null; disabled?: boolean; busy?: boolean; error?: string; onApply: (code: string) => void
}) {
    const t = current.creatorCodes
    const id = useId()
    const [draft, setDraft] = useState(offer?.code || '')
    // A fresh saved offer closes the editor, including when the code is unchanged.
    const [editingOffer, setEditingOffer] = useState<CreatorOffer | null>(null)
    const editing = !!offer && editingOffer === offer
    const apply = (value: string) => {
        if (disabled || busy) return
        const code = value.trim().toUpperCase()
        onApply(code)
    }
    return <div className="space-y-2 text-xs">
        {offer && <div className="flex items-center gap-2">
            <span className="shrink-0 text-white/75">{t.label}</span>
            <p className="m-0 min-w-0 break-words text-[#a6df7a]">{t.applied.replace('{code}', offer.code)} · {offer.discount_percent}% {t.off}</p>
            {!disabled && <button type="button" disabled={busy} aria-expanded={editing} aria-controls={`${id}-editor`}
                onClick={() => { setDraft(offer.code); setEditingOffer(editing ? null : offer) }}
                className="shrink-0 text-white/60 underline hover:text-white disabled:opacity-40 cursor-pointer">{editing ? current.modal.cancel : current.nav.edit}</button>}
        </div>}
        {(!offer || (editing && !disabled)) && <div id={`${id}-editor`} className="space-y-2">
            <label htmlFor={id} className="block text-white/75">{t.label}</label>
            <div className="flex gap-2">
                <input id={id} value={draft} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={disabled || busy} autoFocus={editing}
                    onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(draft) } }}
                    placeholder={t.placeholder} className="min-w-0 flex-1 border border-white/20 bg-black/20 px-3 py-2 text-white disabled:opacity-50" />
                <button type="button" disabled={disabled || busy} onClick={() => apply(draft)} className="border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-40 cursor-pointer">{busy ? t.applying : t.apply}</button>
                {offer && !disabled && <button type="button" disabled={busy} onClick={() => apply('')} className="text-white/60 underline disabled:opacity-40 cursor-pointer">{t.remove}</button>}
            </div>
        </div>}
        {disabled && <p className="m-0 leading-relaxed text-white/45">{t.locked}</p>}
        {error && <p role="alert" className="m-0 text-red-200">{error}</p>}
    </div>
}
