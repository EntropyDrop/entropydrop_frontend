import type en from './locales/en'

export const SUPPORTED_LANGUAGES = ['zh-hans', 'en'] as const;
export type LangKey = typeof SUPPORTED_LANGUAGES[number];

type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> };
type BaseLangData = DeepString<typeof en>;
type ArticleItem = {
    readonly id: string;
    readonly title: string;
    readonly date: string;
    readonly tags: readonly string[];
    readonly summary: string;
};

// Localized editorial calendars do not have to publish every article at the
// same time. Keep the rest of the locale schema strict while allowing each
// language to expose its own article list.
export type LangData = Omit<BaseLangData, 'public_page'> & {
    readonly public_page: Omit<BaseLangData['public_page'], 'articles'> & {
        readonly articles: Omit<BaseLangData['public_page']['articles'], 'list'> & {
            readonly list: readonly ArticleItem[];
        };
    };
};

export const loadLangData = async (lang: LangKey): Promise<LangData> => {
    switch (lang) {
        case 'zh-hans':
            return (await import('./locales/zh-hans')).default;
        case 'en':
        default:
            return (await import('./locales/en')).default;
    }
}
