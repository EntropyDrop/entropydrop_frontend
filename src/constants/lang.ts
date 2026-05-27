import type en from './locales/en'

export const SUPPORTED_LANGUAGES = ['zh-hans', 'en'] as const;
export type LangKey = typeof SUPPORTED_LANGUAGES[number];

type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> };
export type LangData = DeepString<typeof en>;

export const loadLangData = async (lang: LangKey): Promise<LangData> => {
    switch (lang) {
        case 'zh-hans':
            return (await import('./locales/zh-hans')).default;
        case 'en':
        default:
            return (await import('./locales/en')).default;
    }
}
