import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { countries } from '../constants/countries';
import type { LangData } from '../constants/lang';

interface CountrySelectProps {
    id: string;
    value: string;
    onChange: (code: string) => void;
    current: LangData;
    invalid: boolean;
    describedBy?: string;
}

const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const searchableCountries = countries.map(country => ({
    ...country,
    search: normalizeSearch(`${country.name} ${country.zhName} ${country.code}`),
}));

export function CountrySelect({ id, value, onChange, current, invalid, describedBy }: CountrySelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const container = useRef<HTMLDivElement>(null);
    const activeOption = useRef<HTMLLIElement>(null);
    const selected = countries.find(country => country.code === value);
    const displayName = (country: typeof countries[number]) => current.lang === 'zh-hans' ? country.zhName : country.name;
    const search = normalizeSearch(query);
    const exactCode = searchableCountries.find(country => country.code.toLowerCase() === search);
    const filtered = exactCode ? [exactCode] : searchableCountries.filter(country => search.split(/\s+/).every(term => country.search.includes(term)));
    const activeCode = filtered[activeIndex]?.code;
    const listId = `${id}-options`;

    function showOptions() {
        setQuery('');
        setActiveIndex(Math.max(0, countries.findIndex(country => country.code === value)));
        setOpen(true);
    }

    function select(code: string) {
        if (code !== value) onChange(code);
        setOpen(false);
        setQuery('');
    }

    useEffect(() => {
        if (open) activeOption.current?.scrollIntoView({ block: 'nearest' });
    }, [open, activeCode]);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    return <div ref={container} className="relative min-w-0" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
        <input type="hidden" name="country" value={value} />
        <input id={id} role="combobox" type="text" autoComplete="off" spellCheck={false}
            aria-required="true" aria-invalid={invalid} aria-describedby={describedBy}
            aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
            aria-activedescendant={open && activeCode ? `${listId}-${activeCode}` : undefined}
            placeholder={current.address.searchCountry} value={open ? query : selected ? displayName(selected) : value}
            onFocus={showOptions} onClick={() => { if (!open) showOptions(); }}
            onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
            onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (!open) showOptions();
                    else setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!open) showOptions();
                    else if (activeCode) select(activeCode);
                } else if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                } else if (event.key === 'Tab') setOpen(false);
            }}
            className="w-full min-w-0 border border-white/10 bg-white/5 py-2 pl-2 pr-8 text-xs text-white placeholder:text-white/40 focus:border-green-500/30 focus:outline-none" />
        <Icon icon="pixelarticons:chevron-down" aria-hidden="true" className={`pointer-events-none absolute right-2 top-2 text-base text-white/50 ${open ? 'rotate-180' : ''}`} />
        {open && <div className="absolute inset-x-0 top-full z-20 mt-1 border border-white/20 bg-[#1a1a1a] shadow-xl">
            <ul id={listId} role="listbox" aria-label={current.address.country} className="m-0 max-h-[min(15rem,30dvh)] list-none overflow-y-auto overscroll-contain p-1 custom-scrollbar">
                {filtered.map((country, index) => <li key={country.code} id={`${listId}-${country.code}`}
                    ref={index === activeIndex ? activeOption : undefined} role="option" aria-selected={country.code === value}
                    data-country-code={country.code} onMouseDown={event => event.preventDefault()}
                    onClick={() => select(country.code)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-2 py-2 text-xs hover:bg-white/10 ${index === activeIndex ? 'bg-white/10' : ''} ${country.code === value ? 'text-[#84c96b]' : 'text-white'}`}>
                    <span>{displayName(country)}</span><span className="shrink-0 text-white/40">{country.code}</span>
                </li>)}
            </ul>
            {!filtered.length && <p role="status" className="m-0 p-3 text-xs text-white/50">{current.address.noMatchingCountries}</p>}
        </div>}
    </div>;
}
