import type { LangData } from '../../constants/lang'

export const BODY_TYPES_EN = ['SLA', 'FDM', 'UV Inkjet 3D Printing', 'Other/Unknown'];
export const MULTICOLOR_TYPES_EN = ['Stickers', 'UV Inkjet', 'Spraying', 'FDM Multi-color', 'Other/Unknown'];

export const getBodyTypeLabel = (val: string | undefined, current: LangData) => {
    if (!val) return '';
    const idx = BODY_TYPES_EN.findIndex(t => t.toLowerCase() === val.toLowerCase());
    if (idx !== -1 && current.figureForum.bodyTypes?.[idx]) {
        return current.figureForum.bodyTypes[idx];
    }
    return val;
};

export const getMultiColorTypeLabel = (val: string | undefined, current: LangData) => {
    if (!val) return '';
    const idx = MULTICOLOR_TYPES_EN.findIndex(t => t.toLowerCase() === val.toLowerCase());
    if (idx !== -1 && current.figureForum.colorModes?.[idx]) {
        return current.figureForum.colorModes[idx];
    }
    return val;
};

export const extractFirstImageUrl = (markdown: string): string | undefined => {
    // 1. Try markdown image syntax
    const match = markdown.match(/!\[.*?\]\((.*?)\)/);
    if (match) return match[1];
    
    // 2. Try HTML img src syntax
    const htmlMatch = markdown.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
    return htmlMatch ? htmlMatch[1] : undefined;
};
