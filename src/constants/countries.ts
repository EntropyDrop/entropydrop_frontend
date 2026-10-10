import { countries as countryData } from 'countries-list';

export interface Country {
    code: string;
    name: string;
    zhName: string;
    prefix: string;
    prefixes: string[];
}

// Country/region names and calling codes: https://github.com/annexare/Countries (MIT).
const chineseNames = new Intl.DisplayNames(['zh-Hans'], { type: 'region' });
const englishNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Use operational calling codes, without national area codes. See docs/figure-print-commission.md.
const callingCodeOverrides: Record<string, number[]> = { BQ: [599], CW: [599], SJ: [47], VA: [39], XK: [383] };

export const countries: Country[] = Object.entries(countryData).map(([code, data]) => {
    const prefixes = [...new Set((callingCodeOverrides[code] || data.phone)
        .map(value => `+${value >= 1000 && value < 2000 ? 1 : value}`))];
    return { code, name: englishNames.of(code) || data.name, zhName: chineseNames.of(code) || data.name, prefix: prefixes[0] || '', prefixes };
}).sort((a, b) => a.name.localeCompare(b.name, 'en'));

export const phonePrefixes = [...new Set(countries.flatMap(country => country.prefixes))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export function defaultPhonePrefix(countryCode: string) {
    return countries.find(country => country.code === countryCode)?.prefix || '';
}

/** Preserve an explicitly saved prefix, including contacts outside the shipping region. */
export function splitContactPhone(phone: string, countryCode: string) {
    const value = phone.trim();
    const separated = /^(\+\d{1,4})\s+(.+)$/.exec(value);
    if (separated) return { prefix: separated[1], number: separated[2].trim() };
    if (!value.startsWith('+')) return { prefix: defaultPhonePrefix(countryCode), number: value };
    const regional = countries.find(country => country.code === countryCode)?.prefixes || [];
    const prefixes = [...regional, ...phonePrefixes].sort((a, b) => b.length - a.length);
    const prefix = prefixes.find(candidate => value.startsWith(candidate));
    return prefix ? { prefix, number: value.slice(prefix.length).replace(/^[\s-]+/, '') } : { prefix: '', number: value };
}
