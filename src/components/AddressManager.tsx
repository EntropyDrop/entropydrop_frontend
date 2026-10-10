import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react';
import { type LangData } from '../constants/lang';
import { countries, defaultPhonePrefix, phonePrefixes, splitContactPhone } from '../constants/countries';
import { apiFetch } from '../utils/api';
import { addressLimits, addressRule, normalizeAddress, validateAddress, type AddressErrors, type AddressField } from '../constants/shippingAddress';
import { CountrySelect } from './CountrySelect';

interface Address {
    id: string;
    recipient_name: string;
    country: string;
    phone: string;
    zip_code: string;
    state: string;
    city: string;
    detail_address: string;
    is_default: boolean;
}

interface AddressManagerProps {
    isOpen: boolean;
    onClose: () => void;
    current: LangData;
    onSelect?: (address: Address) => void;
    onDelete?: (id: string) => void;
    onUpdate?: (address: Address) => void;
}

export function AddressManager({ isOpen, onClose, current, onSelect, onDelete, onUpdate }: AddressManagerProps) {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<AddressErrors>({});

    // Form states
    const [recipientName, setRecipientName] = useState('');
    const [country, setCountry] = useState('CN');
    const [phonePrefix, setPhonePrefix] = useState('+86');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [zipCode, setZipCode] = useState('');
    const [state, setState] = useState('');
    const [city, setCity] = useState('');
    const [detailAddress, setDetailAddress] = useState('');
    const [isDefault, setIsDefault] = useState(false);
    const rule = addressRule(country);
    const showState = Boolean(rule?.state_visible || state);
    const showPostal = Boolean(rule?.postal_visible || zipCode);

    useEffect(() => {
        if (isOpen) {
            fetchAddresses();
        }
    }, [isOpen]);

    const fetchAddresses = async () => {
        setLoading(true);
        try {
            const response = await apiFetch('/api/addresses');
            if (response.ok) {
                const data = await response.json();
                setAddresses(data);
            }
        } catch (e) {
            console.error('Failed to fetch addresses', e);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setErrors({});
        setRecipientName('');
        setCountry('CN');
        setPhonePrefix('+86');
        setPhoneNumber('');
        setZipCode('');
        setState('');
        setCity('');
        setDetailAddress('');
        setIsDefault(false);
        setEditingAddress(null);
    };

    const handleAddClick = () => {
        if (addresses.length >= 10) {
            alert(current.address.maxAddresses);
            return;
        }
        resetForm();
        setIsFormOpen(true);
    };

    const handleEditClick = (address: Address) => {
        setErrors({});
        setEditingAddress(address);
        const normalized = normalizeAddress(address);
        setRecipientName(normalized.recipient_name);
        setCountry(normalized.country);
        const phone = splitContactPhone(address.phone, address.country);
        setPhonePrefix(phone.prefix);
        setPhoneNumber(phone.number);
        setZipCode(normalized.zip_code);
        setState(normalized.state);
        setCity(address.city);
        setDetailAddress(address.detail_address);
        setIsDefault(address.is_default);
        setIsFormOpen(true);
    };

    const handleSave = async () => {
        const phone = phoneNumber.trim().startsWith('+')
            ? splitContactPhone(phoneNumber, country)
            : { prefix: phonePrefix, number: phoneNumber.trim() };
        const fullPhone = [phone.prefix, phone.number].filter(Boolean).join(' ');
        const address = normalizeAddress({ recipient_name: recipientName, country, phone: phoneNumber.trim() ? fullPhone : '', zip_code: zipCode, state, city, detail_address: detailAddress });
        const fieldErrors = validateAddress(address);
        if (Object.keys(fieldErrors).length) {
            setErrors(fieldErrors);
            return;
        }
        setErrors({});
        const payload = { ...address, is_default: isDefault };

        try {
            const url = editingAddress 
                ? `/api/addresses/${editingAddress.id}`
                : '/api/addresses';
            const method = editingAddress ? 'PUT' : 'POST';

            const response = await apiFetch(url, {
                method: method,
                skipGlobalError: true,
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                if (editingAddress) onUpdate?.({ ...editingAddress, ...payload });
                setIsFormOpen(false);
                resetForm();
                fetchAddresses();
            } else {
                const err = await response.json();
                if (err.detail?.code === 'invalid_shipping_address' && err.detail.fields) {
                    setErrors(err.detail.fields);
                } else {
                    alert(typeof err.detail === 'string' ? err.detail : current.address.saveFailed);
                }
            }
        } catch (e) {
            console.error('Save failed', e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(current.address.confirmDelete)) return;

        try {
            const response = await apiFetch(`/api/addresses/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                // Apply the confirmed deletion even if refreshing the address list fails.
                setAddresses(previous => previous.filter(address => address.id !== id));
                onDelete?.(id);
                void fetchAddresses();
                if (editingAddress?.id === id) {
                    setIsFormOpen(false);
                    resetForm();
                }
            }
        } catch (e) {
            console.error('Delete failed', e);
        }
    };

    const handleCountryChange = (selectedCode: string) => {
        setCountry(selectedCode);
        setState('');
        setZipCode('');
        setErrors({});
        setPhonePrefix(defaultPhonePrefix(selectedCode));
    };

    const fieldError = (field: AddressField) => {
        const code = errors[field];
        if (!code) return null;
        const message = current.address.validation[code] || current.address.saveFailed;
        return <p id={`shipping-error-${field}`} role="alert" className="m-0 text-xs text-red-300">{message.replace('{example}', rule?.postal_example || '').replace('{limit}', String(addressLimits[field]))}</p>;
    };
    const accessibility = (field: AddressField) => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `shipping-error-${field}` : undefined });
    const requiredMark = <span aria-hidden="true"> *</span>;
    const selectAddress = (address: Address) => {
        if (!onSelect) return;
        const fieldErrors = validateAddress(address);
        if (Object.keys(fieldErrors).length) {
            handleEditClick(address);
            setErrors(fieldErrors);
        } else {
            onSelect(address);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
            <div className="w-full max-w-lg bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-4 shadow-2xl max-h-[85dvh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h3 className={`text-white text-lg m-0 ${current.fontClass}`}>
                        {current.address.managerTitle}
                    </h3>
                    <button onClick={onClose} className="text-white/40 hover:text-white cursor-pointer">
                        <Icon icon="pixelarticons:close" className="text-xl" />
                    </button>
                </div>

                {isFormOpen ? (
                    <form noValidate onSubmit={event => { event.preventDefault(); void handleSave(); }} className="flex flex-col gap-3 animate-in fade-in duration-200">
                        <h4 className="text-white/80 text-sm font-bold">
                            {editingAddress ? current.address.editAddress : current.address.addAddress}
                        </h4>
                        <p className="m-0 text-xs text-white/50">{current.address.requiredFields}</p>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="shipping-recipient" className="text-white/60 text-xs">{current.address.recipientName}{requiredMark}</label>
                            <input {...accessibility('recipient_name')} id="shipping-recipient" name="recipient_name" type="text" autoComplete="shipping name" required
                                maxLength={addressLimits.recipient_name} value={recipientName} onChange={event => setRecipientName(event.target.value)}
                                className="w-full min-w-0 border border-white/10 bg-white/5 p-2 text-xs text-white focus:border-green-500/30 focus:outline-none" />
                            {fieldError('recipient_name')}
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="shipping-country" className="text-white/60 text-xs">{current.address.country}{requiredMark}</label>
                            <CountrySelect id="shipping-country" value={country} onChange={handleCountryChange} current={current}
                                invalid={Boolean(errors.country)} describedBy={errors.country ? 'shipping-error-country' : undefined} />
                            {fieldError('country')}
                        </div>
                        <div className={`grid gap-3 ${showState ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {showState && <div className="flex min-w-0 flex-col gap-1">
                                <label htmlFor="shipping-state" className="text-white/60 text-xs">{current.address.state}{rule?.state_required && requiredMark}</label>
                                {rule?.states ? <select {...accessibility('state')} id="shipping-state" name="state" autoComplete="shipping address-level1" required={rule.state_required} value={state} onChange={event => setState(event.target.value)} className="w-full min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs">
                                    <option value="" className="bg-[#1a1a1a]">{current.address.selectState}</option>
                                    {state && !rule.states[state] && <option value={state} className="bg-[#1a1a1a]">{state}</option>}
                                    {Object.entries(rule.states).map(([code, name]) => <option key={code} value={code} className="bg-[#1a1a1a]">{name} ({code})</option>)}
                                </select> : <input {...accessibility('state')} id="shipping-state" name="state" type="text" autoComplete="shipping address-level1" maxLength={addressLimits.state} required={rule?.state_required} value={state} onChange={event => setState(event.target.value)} className="w-full min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs" />}
                                {fieldError('state')}
                            </div>}
                            <div className="flex min-w-0 flex-col gap-1">
                                <label htmlFor="shipping-city" className="text-white/60 text-xs">{current.address.city}{rule?.city_required && requiredMark}</label>
                                <input {...accessibility('city')} id="shipping-city" name="city" type="text" autoComplete="shipping address-level2" maxLength={addressLimits.city} required={rule?.city_required} value={city} onChange={event => setCity(event.target.value)} className="w-full min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs" />
                                {fieldError('city')}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="shipping-street" className="text-white/60 text-xs">{current.address.detailAddress}{requiredMark}</label>
                            <textarea {...accessibility('detail_address')} id="shipping-street" name="detail_address" autoComplete="shipping street-address" maxLength={addressLimits.detail_address} required value={detailAddress} onChange={event => setDetailAddress(event.target.value)} className="w-full min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs h-16 resize-none" />
                            {fieldError('detail_address')}
                        </div>
                        {showPostal && <div className="flex flex-col gap-1">
                            <label htmlFor="shipping-postal-code" className="text-white/60 text-xs">{current.address.zipCode}{rule?.postal_required && requiredMark}</label>
                            <input {...accessibility('zip_code')} id="shipping-postal-code" name="zip_code" type="text" autoComplete="shipping postal-code" maxLength={addressLimits.zip_code} required={rule?.postal_required} placeholder={rule?.postal_example} value={zipCode} onChange={event => setZipCode(event.target.value)} className="w-full min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs" />
                            {fieldError('zip_code')}
                        </div>}
                        <div className="flex flex-col gap-1">
                            <label htmlFor="shipping-phone" className="text-white/60 text-xs">{current.address.phone}{requiredMark}</label>
                            <div className="flex gap-2">
                                <select aria-label={current.address.phonePrefix} name="phone_prefix" autoComplete="shipping tel-country-code" value={phonePrefix} onChange={event => setPhonePrefix(event.target.value)} className="bg-white/5 border border-white/10 p-2 text-white text-xs w-28 shrink-0">
                                    <option value="" className="bg-[#1a1a1a]">{current.address.selectPhonePrefix}</option>
                                    {phonePrefix && !phonePrefixes.includes(phonePrefix) && <option value={phonePrefix}>{phonePrefix}</option>}
                                    {phonePrefixes.map(prefix => <option key={prefix} value={prefix} className="bg-[#1a1a1a]">{prefix}</option>)}
                                </select>
                                <input {...accessibility('phone')} id="shipping-phone" name="phone" type="tel" inputMode="tel" autoComplete="shipping tel-national" placeholder={current.address.phoneNumber} maxLength={44} required value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} className="min-w-0 bg-white/5 border border-white/10 p-2 text-white text-xs flex-1" />
                            </div>
                            {fieldError('phone')}
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input 
                                type="checkbox" 
                                checked={isDefault} 
                                onChange={e => setIsDefault(e.target.checked)}
                                className="accent-green-500"
                            />
                             <span className="text-white/60 text-xs">{current.address.setDefault}</span>
                        </label>

                        <div className="flex gap-2 justify-end mt-2">
                            <button 
                                type="button" onClick={() => setIsFormOpen(false)}
                                className="px-4 py-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 text-xs cursor-pointer"
                            >
                                 {current.modal.cancel}
                            </button>
                            <button 
                                type="submit"
                                className="px-4 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-black text-xs cursor-pointer"
                            >
                                 {current.address.save}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col gap-3 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center">
                             <span className="text-white/40 text-xs">{current.address.addedCount.replace('{count}', addresses.length.toString())}</span>
                            {addresses.length < 10 && (
                                <button 
                                    onClick={handleAddClick}
                                    className="px-3 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-black text-xs cursor-pointer flex items-center gap-1"
                                >
                                    <Icon icon="pixelarticons:plus" />
                                     {current.address.addNew}
                                </button>
                            )}
                        </div>

                        {loading ? (
                             <div className="text-white/40 text-center text-xs py-4">{current.orders.loading}</div>
                        ) : addresses.length === 0 ? (
                            <div className="text-white/20 text-center text-xs py-4">
                                 {current.address.noAddresses}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-[40dvh] overflow-y-auto custom-scrollbar">
                                {addresses.map(addr => (
                                    <div 
                                        key={addr.id} 
                                        onClick={() => selectAddress(addr)}
                                        className={`p-3 border border-white/5 hover:border-green-500/30 bg-white/5 flex flex-col gap-1 relative group ${onSelect ? 'cursor-pointer' : ''}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="text-white font-bold text-xs flex items-center gap-1">
                                                {(() => {
                                                    const countryObj = countries.find(c => c.code === addr.country);
                                                    return countryObj ? (current.lang === 'zh-hans' ? countryObj.zhName : countryObj.name) : addr.country;
                                                })()} {addr.state} {addr.city}
                                                {addr.is_default && (
                                                    <span className="px-1 bg-green-500/20 text-green-500 text-[8px] border border-green-500/30">DEFAULT</span>
                                                )}
                                            </span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    aria-label={current.address.editAddress}
                                                    onClick={(e) => { e.stopPropagation(); handleEditClick(addr); }}
                                                    className="text-white/40 hover:text-white cursor-pointer"
                                                >
                                                    <Icon icon="pixelarticons:edit" className="text-sm" />
                                                </button>
                                                <button 
                                                    aria-label={current.address.deleteAddress}
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(addr.id); }}
                                                    className="text-white/40 hover:text-red-500 cursor-pointer"
                                                >
                                                    <Icon icon="pixelarticons:trash" className="text-sm" />
                                                </button>
                                            </div>
                                        </div>
                                        {addr.recipient_name && <div className="break-words text-xs text-white/80">{addr.recipient_name}</div>}
                                        <div className="text-white/60 text-xs">{addr.detail_address}</div>
                                        <div className="text-white/40 text-[10px]">{addr.phone} | {addr.zip_code}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
