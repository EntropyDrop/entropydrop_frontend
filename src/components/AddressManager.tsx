import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react';
import { type LangData } from '../constants/lang';
import { countries } from '../constants/countries';
import { apiFetch } from '../utils/api';

interface Address {
    id: string;
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
}

export function AddressManager({ isOpen, onClose, current, onSelect }: AddressManagerProps) {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);
    const [loading, setLoading] = useState(false);

    // Form states
    const [country, setCountry] = useState('CN');
    const [phonePrefix, setPhonePrefix] = useState('+86');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [zipCode, setZipCode] = useState('');
    const [state, setState] = useState('');
    const [city, setCity] = useState('');
    const [detailAddress, setDetailAddress] = useState('');
    const [isDefault, setIsDefault] = useState(false);

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
        setEditingAddress(address);
        setCountry(address.country);
        // Split phone by space or look up prefix
        const foundCountry = countries.find(c => address.phone.startsWith(c.prefix));
        if (foundCountry) {
            setPhonePrefix(foundCountry.prefix);
            setPhoneNumber(address.phone.replace(foundCountry.prefix, '').trim());
        } else {
            // Fallback: assume first component is prefix if space separated
            const parts = address.phone.split(' ');
            if (parts.length > 1) {
                setPhonePrefix(parts[0]);
                setPhoneNumber(parts.slice(1).join(' '));
            } else {
                setPhonePrefix('');
                setPhoneNumber(address.phone);
            }
        }
        setZipCode(address.zip_code);
        setState(address.state);
        setCity(address.city);
        setDetailAddress(address.detail_address);
        setIsDefault(address.is_default);
        setIsFormOpen(true);
    };

    const handleSave = async () => {
        if (!state || !city || !detailAddress || !phoneNumber) {
            alert(current.address.fillAllFields);
            return;
        }

        const fullPhone = `${phonePrefix} ${phoneNumber}`;
        const payload = {
            country,
            phone: fullPhone,
            zip_code: zipCode,
            state,
            city,
            detail_address: detailAddress,
            is_default: isDefault
        };

        try {
            const url = editingAddress 
                ? `/api/addresses/${editingAddress.id}`
                : '/api/addresses';
            const method = editingAddress ? 'PUT' : 'POST';

            const response = await apiFetch(url, {
                method: method,
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setIsFormOpen(false);
                resetForm();
                fetchAddresses();
            } else {
                const err = await response.json();
                alert(err.detail || current.address.saveFailed);
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
                fetchAddresses();
                if (editingAddress?.id === id) {
                    setIsFormOpen(false);
                    resetForm();
                }
            }
        } catch (e) {
            console.error('Delete failed', e);
        }
    };

    const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedCode = e.target.value;
        setCountry(selectedCode);
        const found = countries.find(c => c.code === selectedCode);
        if (found) {
            setPhonePrefix(found.prefix);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
            <div className="w-full max-w-lg bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-4 shadow-2xl maxHeight-[80vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h3 className={`text-white text-lg m-0 ${current.fontClass}`}>
                        {current.address.managerTitle}
                    </h3>
                    <button onClick={onClose} className="text-white/40 hover:text-white cursor-pointer">
                        <Icon icon="pixelarticons:close" className="text-xl" />
                    </button>
                </div>

                {isFormOpen ? (
                    <div className="flex flex-col gap-3 animate-in fade-in duration-200">
                        <h4 className="text-white/80 text-sm font-bold">
                            {editingAddress ? current.address.editAddress : current.address.addAddress}
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-white/60 text-xs">{current.address.country}</label>
                                <select 
                                    value={country} 
                                    onChange={handleCountryChange}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs focus:outline-none focus:border-green-500/30"
                                >
                                    {countries.map(c => (
                                        <option key={c.code} value={c.code} className="bg-[#1a1a1a]">
                                            {current.lang === 'zh-hans' ? c.zhName : c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-white/60 text-xs">{current.address.zipCode}</label>
                                <input 
                                    type="text" 
                                    value={zipCode} 
                                    onChange={e => setZipCode(e.target.value)}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                             <label className="text-white/60 text-xs">{current.address.phone}</label>
                            <div className="flex gap-2">
                                <select 
                                    value={phonePrefix} 
                                    onChange={e => setPhonePrefix(e.target.value)}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs w-24"
                                >
                                    {countries.map(c => (
                                        <option key={c.code} value={c.prefix} className="bg-[#1a1a1a]">
                                            {c.prefix}
                                        </option>
                                    ))}
                                </select>
                                <input 
                                    type="text" 
                                    placeholder="Phone Number"
                                    value={phoneNumber} 
                                    onChange={e => setPhoneNumber(e.target.value)}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs flex-1"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                 <label className="text-white/60 text-xs">{current.address.state}</label>
                                <input 
                                    type="text" 
                                    value={state} 
                                    onChange={e => setState(e.target.value)}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                 <label className="text-white/60 text-xs">{current.address.city}</label>
                                <input 
                                    type="text" 
                                    value={city} 
                                    onChange={e => setCity(e.target.value)}
                                    className="bg-white/5 border border-white/10 p-2 text-white text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                             <label className="text-white/60 text-xs">{current.address.detailAddress}</label>
                            <textarea 
                                value={detailAddress} 
                                onChange={e => setDetailAddress(e.target.value)}
                                className="bg-white/5 border border-white/10 p-2 text-white text-xs h-16 resize-none"
                            />
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
                                onClick={() => setIsFormOpen(false)}
                                className="px-4 py-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 text-xs cursor-pointer"
                            >
                                 {current.modal.cancel}
                            </button>
                            <button 
                                onClick={handleSave}
                                className="px-4 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-black text-xs cursor-pointer"
                            >
                                 {current.address.save}
                            </button>
                        </div>
                    </div>
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
                            <div className="flex flex-col gap-2 maxHeight-[40vh] overflow-y-auto custom-scrollbar">
                                {addresses.map(addr => (
                                    <div 
                                        key={addr.id} 
                                        onClick={() => onSelect && onSelect(addr)}
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
                                                    onClick={(e) => { e.stopPropagation(); handleEditClick(addr); }}
                                                    className="text-white/40 hover:text-white cursor-pointer"
                                                >
                                                    <Icon icon="pixelarticons:edit" className="text-sm" />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(addr.id); }}
                                                    className="text-white/40 hover:text-red-500 cursor-pointer"
                                                >
                                                    <Icon icon="pixelarticons:trash" className="text-sm" />
                                                </button>
                                            </div>
                                        </div>
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
