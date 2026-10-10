import data from './shipping-address-rules.json';

export type AddressField = 'recipient_name' | 'country' | 'state' | 'city' | 'zip_code' | 'detail_address' | 'phone';
export type AddressValues = Record<AddressField, string>;
export type AddressError = 'required' | 'country_invalid' | 'state_invalid' | 'postal_unused' | 'postal_format' | 'street_length' | 'too_long';
export type AddressErrors = Partial<Record<AddressField, AddressError>>;
export interface AddressRule {
    state_required: boolean;
    state_visible: boolean;
    city_required: boolean;
    postal_required: boolean;
    postal_visible: boolean;
    postal_pattern: string;
    postal_example: string;
    states?: Record<string, string>;
}
const rules: Record<string, AddressRule> = data.countries;
export const addressLimits = data.limits;
export const addressRulesVersion = data.version;
export const addressRule = (country: string): AddressRule | undefined => rules[country];

export function normalizeAddress(address: AddressValues): AddressValues {
    const normalized = Object.fromEntries((Object.keys(addressLimits) as AddressField[]).map(key => [key, (address[key] || '').trim()])) as AddressValues;
    const country = normalized.country.toUpperCase();
    normalized.country = ({ C2: 'CN', UK: 'GB' } as Record<string, string>)[country] || country;
    normalized.zip_code = normalized.zip_code.normalize('NFKC').toUpperCase();
    for (const [code, name] of Object.entries(addressRule(normalized.country)?.states || {})) {
        if ([code.toLowerCase(), name.toLowerCase()].includes(normalized.state.toLowerCase())) {
            normalized.state = code;
            break;
        }
    }
    return normalized;
}

function streetLines(street: string) {
    const lines = street.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
    let first = lines[0] || '', rest = lines.slice(1).join(' ');
    const chars = Array.from(first);
    if (chars.length > 300) {
        let split = chars.slice(0, 301).lastIndexOf(' ');
        if (split <= 0 || Array.from([chars.slice(split).join('').trim(), rest].filter(Boolean).join(' ')).length > 300) split = 300;
        first = chars.slice(0, split).join('');
        rest = [chars.slice(split).join('').trim(), rest].filter(Boolean).join(' ');
    }
    return [first, rest];
}

export function validateAddress(address: AddressValues): AddressErrors {
    const normalized = normalizeAddress(address);
    const rule = addressRule(normalized.country);
    const errors: AddressErrors = {};
    for (const field of ['recipient_name', 'country', 'detail_address', 'phone'] as const) {
        if (!normalized[field]) errors[field] = 'required';
    }
    if (normalized.country && !rule) errors.country = 'country_invalid';
    for (const field of Object.keys(addressLimits) as AddressField[]) {
        if (Array.from(normalized[field]).length > addressLimits[field]) errors[field] = 'too_long';
    }
    if (rule) {
        if (rule.state_required && !normalized.state) errors.state = 'required';
        if (rule.city_required && !normalized.city) errors.city = 'required';
        if (rule.postal_required && !normalized.zip_code) errors.zip_code = 'required';
        if (normalized.state && rule.states && !rule.states[normalized.state]) errors.state = 'state_invalid';
        if (normalized.zip_code && !rule.postal_visible) errors.zip_code = 'postal_unused';
        else if (normalized.zip_code && rule.postal_pattern && !new RegExp(`^(?:${rule.postal_pattern})$`, 'i').test(normalized.zip_code)) errors.zip_code = 'postal_format';
    }
    if (streetLines(normalized.detail_address).some(line => Array.from(line).length > 300) || Array.from(normalized.detail_address).length > 600) errors.detail_address = 'street_length';
    return errors;
}
