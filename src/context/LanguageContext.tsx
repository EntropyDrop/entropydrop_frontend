import { createContext, useContext, type ReactNode } from 'react'
import type { LangKey, LangData } from '../constants/lang'

export interface LanguageContextValue {
    lang: LangKey
    setLang: (l: LangKey) => void
    isAuto: boolean
    setIsAuto: (a: boolean) => void
    current?: LangData
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

export function useLanguage(): LanguageContextValue | null {
    return useContext(LanguageContext)
}

export function LanguageProvider({
    value,
    children,
}: {
    value: LanguageContextValue
    children: ReactNode
}) {
    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
