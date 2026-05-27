import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { MC } from '../components/MC'
import { AddressManager } from '../components/AddressManager'
import { apiFetch } from '../utils/api'
import { showError } from '../utils/alert'

interface PrintPageProps {
    current: LangData
}

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

export function PrintPage({ current }: PrintPageProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const [displayTextureUrl, setDisplayTextureUrl] = useState<string | undefined>(location.state?.textureUrl);
    const [_uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
    const [isAddressOpen, setIsAddressOpen] = useState(false);

    const [mode] = useState<'voxel' | 'plane'>('voxel');
    const [action] = useState<'idle' | 'walking'>('idle');

    const [visibleParts, setVisibleParts] = useState({
        head: true,
        body: true,
        leftArm: true,
        rightArm: true,
        leftLeg: true,
        rightLeg: true
    });
    const [showOverlay] = useState(true);
    const [currentMedia, setCurrentMedia] = useState(0); // For Promo Carousel
    const [isSoldOut, setIsSoldOut] = useState(false);
    const [modelType, setModelType] = useState<string>('');
    const [price, setPrice] = useState<number>(60);
    const [availableModels, setAvailableModels] = useState<{ model_type: string, available: boolean, price: number }[]>([]);

    useEffect(() => {
        if (localStorage.getItem('token')) {
            fetchDefaultAddress();
            fetchStockInfo();
        }
    }, []);

    const fetchStockInfo = async () => {
        try {
            const response = await apiFetch('/api/orders/model-stock?order_type=print');
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    setAvailableModels(data);
                    const printModel = data[0]; // Assuming the first one is the default print model
                    setModelType(printModel.model_type);
                    setPrice(printModel.price);
                    setIsSoldOut(!printModel.available);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };


    const fetchDefaultAddress = async () => {
        try {
            const response = await apiFetch('/api/addresses');
            if (response.ok) {
                const data = await response.json();
                const defaultAddress = data.find((addr: Address) => addr.is_default);
                if (defaultAddress) {
                    setSelectedAddress(defaultAddress);
                } else if (data.length > 0) {
                    setSelectedAddress(data[0]);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const togglePart = (part: keyof typeof visibleParts) => {

        setVisibleParts(prev => ({ ...prev, [part]: !prev[part] }));
    };

    if (!localStorage.getItem('token')) {
        return (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
                <div className="w-full max-w-7xl h-full flex flex-col items-center justify-center gap-6 bg-black/40 backdrop-blur-md p-6 sm:p-8 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto text-white">
                    <Icon icon="pixelarticons:lock" className="text-6xl opacity-30" />
                    <div className="text-center flex flex-col gap-1">
                        <h2 className={`text-xl font-bold ${current.fontClass}`}>
                            {current.common.authRequired}
                        </h2>
                        <p className={`text-white/60 text-xs ${current.fontClass}`}>
                            {current.print.loginPrompt}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (!displayTextureUrl) {
        const mediaItems = [
            { type: 'video', src: '/videos/promo.mp4', poster: '/images/3d_print_promo.png', label: current.print.promoLabels.video },
            { type: 'image', src: '/images/promo_1.png', label: current.print.promoLabels.style1 },
            { type: 'image', src: '/images/promo_2.png', label: current.print.promoLabels.style2 },
            { type: 'image', src: '/images/promo_3.png', label: current.print.promoLabels.style3 }
        ];

        return (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
                <div className="w-full max-w-7xl h-full flex flex-col lg:flex-row gap-8 bg-black/40 backdrop-blur-md p-6 sm:p-10 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto text-white animate-in fade-in duration-300">
                    {/* Left: Content & Guidance */}
                    <div className="flex-1 flex flex-col justify-center gap-6 max-w-xl">
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-green-500 font-mono tracking-wider bg-green-500/10 self-start px-2 py-0.5 border border-green-500/30 rounded-sm">3D PRINT SERVICE</span>
                            </div>
                            <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white via-white/80 to-white/40 bg-clip-text text-transparent ${current.fontClass}`}>
                                {current.print.title}
                            </h1>
                            <p className={`text-white/60 text-xs sm:text-sm ${current.fontClass}`}>
                                {current.print.description}
                            </p>
                        </div>


                        {/* Price and Delivery Details */}
                        <div className="grid grid-cols-3 gap-2 bg-white/5 border border-white/10 p-4 ">
                            <div className="flex flex-col gap-1 border-r border-white/10 pr-2">
                                <span className="text-white/40 text-[10px]">{current.print.priceLabel}</span>
                                <span className="text-xl font-bold font-mono text-green-500">${price}</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-white/10 pr-2 pl-1">
                                <span className="text-white/40 text-[10px]">{current.print.shippingLabel}</span>
                                <span className="text-xs font-bold text-green-500 flex items-center gap-0.5 whitespace-nowrap">
                                    <Icon icon="pixelarticons:globe" className="text-sm" />
                                    {current.print.freeShipping}
                                </span>
                                <span className="text-white/60 text-[10px]">{current.print.deliveryTime}</span>
                            </div>
                            <div className="flex flex-col gap-1 pl-1">
                                <span className="text-white/40 text-[10px]">{current.print.trackingLabel}</span>
                                <span className="text-xs font-bold text-white flex items-center gap-0.5 whitespace-nowrap">
                                    <Icon icon="pixelarticons:eye" className="text-sm text-blue-400" />
                                    {current.print.fullTracking}
                                </span>
                                <span className="text-white/60 text-[10px]">{current.print.realTimeUpdates}</span>
                            </div>
                        </div>

                        {/* Specifications Bar */}
                        <div className="flex flex-wrap items-center gap-y-4 gap-x-8 bg-white/5 border border-white/10 p-4">
                            <div className="flex items-center gap-3">
                                <Icon icon="pixelarticons:scale" className="text-white/20 text-xl" />
                                <div className="flex flex-col">
                                    <span className="text-white/40 text-[9px] uppercase tracking-tighter leading-none mb-1">{current.print.dimensionsLabel}</span>
                                    <span className="text-xs font-bold font-mono leading-none">{current.print.dimensionsDetail}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Icon icon="pixelarticons:cube" className="text-white/20 text-xl" />
                                <div className="flex flex-col">
                                    <span className="text-white/40 text-[9px] uppercase tracking-tighter leading-none mb-1">{current.print.modelMaterialLabel}</span>
                                    <span className="text-xs font-bold leading-none">{current.print.modelMaterial}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Icon icon="pixelarticons:image" className="text-white/20 text-xl" />
                                <div className="flex flex-col">
                                    <span className="text-white/40 text-[9px] uppercase tracking-tighter leading-none mb-1">{current.print.stickerMaterialLabel}</span>
                                    <span className="text-xs font-bold leading-none">{current.print.stickerMaterial}</span>
                                </div>
                            </div>
                        </div>

                        {/* Age Warning */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/5 border border-yellow-500/20 absolute top-4 right-4">
                            <span className="text-[10px] font-bold text-yellow-500/80 border border-yellow-500/30 px-1 uppercase tracking-wider">14+</span>
                            <span className="text-white/60 text-[10px] sm:text-xs">{current.print.ageWarning}</span>
                        </div>

                        {/* Feature Highlights Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 border border-white/5 p-3 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
                                <Icon icon="pixelarticons:human-run" className="text-green-500 text-xl" />
                                <span className={`text-white text-xs font-bold ${current.fontClass}`}>{current.print.features.articulated.title}</span>
                                <span className={`text-white/40 text-[10px] leading-relaxed ${current.fontClass}`}>{current.print.features.articulated.desc}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-3 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
                                <Icon icon="pixelarticons:box-multiple" className="text-green-500 text-xl" />
                                <span className={`text-white text-xs font-bold ${current.fontClass}`}>{current.print.features.precision.title}</span>
                                <span className={`text-white/40 text-[10px] leading-relaxed ${current.fontClass}`}>{current.print.features.precision.desc}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-3 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
                                <Icon icon="pixelarticons:image" className="text-green-500 text-xl" />
                                <span className={`text-white text-xs font-bold ${current.fontClass}`}>{current.print.features.clarity.title}</span>
                                <span className={`text-white/40 text-[10px] leading-relaxed ${current.fontClass}`}>{current.print.features.clarity.desc}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-3 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
                                <Icon icon="pixelarticons:color-swatch" className="text-green-500 text-xl" />
                                <span className={`text-white text-xs font-bold ${current.fontClass}`}>{current.print.features.color.title}</span>
                                <span className={`text-white/40 text-[10px] leading-relaxed ${current.fontClass}`}>{current.print.features.color.desc}</span>
                            </div>
                        </div>

                        {/* CTA */}
                        <div>
                            {isSoldOut && (
                                <div className="bg-red-500/10 border border-red-500/30 p-2 mb-3 rounded text-red-500 text-[11px] flex items-center gap-1.5 font-bold">
                                    <Icon icon="pixelarticons:warning-box" className="text-sm" />
                                    <span>{current.print.soldOutNotice}</span>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => navigate('/skin/')}
                                    className={`py-3 px-6 bg-white/10 hover:bg-white/20 text-white border-2 border-white/20 cursor-pointer transition-all flex items-center gap-2 text-xs lg:text-sm active:transform active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:image" className="text-sm" />
                                    {current.print.discoverSkins}
                                </button>

                                <button
                                    onClick={() => navigate('/skin/collection')}
                                    className={`py-3 px-6 bg-white/10 hover:bg-white/20 text-white border-2 border-white/20 cursor-pointer transition-all flex items-center gap-2 text-xs lg:text-sm active:transform active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:folder" className="text-sm" />
                                    {current.print.fromCollection}
                                </button>

                                <input
                                    id="upload-skin-input"
                                    type="file"
                                    accept="image/png"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        if (file.size > 512 * 1024) {
                                            showError(current.print.fileTooLarge);
                                            return;
                                        }

                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                            const img = new Image();
                                            img.onload = () => {
                                                const tempCanvas = document.createElement('canvas');
                                                const ctx = tempCanvas.getContext('2d');
                                                if (!ctx) return;

                                                tempCanvas.width = 64;
                                                tempCanvas.height = 64;
                                                ctx.clearRect(0, 0, 64, 64);

                                                if (img.width === 64 && img.height === 32) {
                                                    ctx.drawImage(img, 0, 0);
                                                    ctx.drawImage(img, 40, 16, 16, 16, 32, 48, 16, 16);
                                                    ctx.drawImage(img, 0, 16, 16, 16, 16, 48, 16, 16);
                                                } else {
                                                    ctx.drawImage(img, 0, 0, 64, 64);
                                                }

                                                setDisplayTextureUrl(tempCanvas.toDataURL('image/png'));
                                                setUploadedFile(file);
                                            };
                                            img.src = event.target?.result as string;
                                        };
                                        reader.readAsDataURL(file);
                                    }}
                                />
                                <button
                                    onClick={() => document.getElementById('upload-skin-input')?.click()}
                                    className={`py-3 px-6 bg-[#3c8527] hover:bg-[#4ea632] text-white border-2 border-black cursor-pointer transition-all flex items-center gap-2 text-xs lg:text-sm active:transform active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:upload" className="text-sm" />
                                    {current.print.uploadLocal}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Media Carousel */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[350px] lg:min-h-0 relative">
                        <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-black/20 border border-white/10 group shadow-xl">
                            {mediaItems[currentMedia].type === 'video' ? (
                                <div className="w-full h-full relative">
                                    <video
                                        src={mediaItems[currentMedia].src}
                                        poster={mediaItems[currentMedia].poster}
                                        className="w-full h-full object-cover"
                                        controls
                                        muted
                                        autoPlay
                                        loop
                                    />
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[8px] font-mono text-white/80 border border-white/10 overflow-hidden">VIDEO</div>
                                </div>
                            ) : (
                                <img
                                    src={mediaItems[currentMedia].src}
                                    alt={mediaItems[currentMedia].label}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 overflow-hidden"
                                    onError={(e) => { e.currentTarget.src = '/images/3d_print_promo.png'; }}
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                            {/* Floating Badges */}
                            <div className="absolute top-4 left-4 flex flex-col gap-1">
                                <span className="px-2 py-1 bg-black/60 backdrop-blur-md text-[10px] text-white/80 border border-white/10 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> ♻️ {current.print.ecoMaterial}
                                </span>
                                <span className="px-2 py-1 bg-black/60 backdrop-blur-md text-[10px] text-white/80 border border-white/10 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" /> 🎯 {current.print.oneToOne}
                                </span>
                                <span className="px-2 py-1 bg-black/60 backdrop-blur-md text-[10px] text-white/80 border border-white/10 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" /> 🎨 {current.print.whiteModelSticker}
                                </span>
                            </div>
                        </div>

                        {/* Pagination / Thumbnails */}
                        <div className="flex gap-2">
                            {mediaItems.map((item, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentMedia(idx)}
                                    className={`w-10 h-10 rounded border transition-all cursor-pointer overflow-hidden flex items-center justify-center relative ${currentMedia === idx ? 'border-green-500 bg-white/10 scale-105' : 'border-white/10 bg-black/40 hover:border-white/30'}`}
                                >
                                    {item.type === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center bg-black/60">
                                            <Icon icon="pixelarticons:play" className="text-lg text-white" />
                                        </div>
                                    ) : (
                                        <img
                                            src={item.src}
                                            className="w-full h-full object-cover opacity-60 hover:opacity-100"
                                            onError={(e) => { e.currentTarget.src = '/images/3d_print_promo.png'; }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }


    const handleCreateOrder = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            alert(current.common.authRequired);
            return;
        }

        if (!selectedAddress) {
            alert(current.print.selectAddress);
            setIsAddressOpen(true);
            return;
        }

        setIsUploading(true);
        try {
            let item_id = location.state?.item?.id;

            if (!item_id) {
                alert(current.print.infoMissing);
                setIsUploading(false);
                return;
            }

            const response = await apiFetch('/api/orders', {
                method: 'POST',
                body: JSON.stringify({
                    order_type: 'print',
                    log_id: item_id,
                    model_type: modelType,
                    address_id: selectedAddress.id
                })
            });

            if (response.ok) {
                navigate('/skin/orders');
            } else {
                const errorData = await response.json();
                alert(errorData.detail || current.print.createFailed);
            }
        } catch (e) {
            alert(current.orders.networkError);
        } finally {
            setIsUploading(false);
        }
    };


    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            <div className="w-full max-w-7xl h-full flex flex-col gap-4 bg-black/40 backdrop-blur-md p-6 border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-300 pointer-events-auto">
                {/* Header */}
                <div className="flex justify-between items-end border-b border-white/10 pb-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/skin/print')}
                            className="p-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                        >
                            <Icon icon="pixelarticons:arrow-left" className="text-xl" />
                        </button>
                        <h2 className={`text-white text-xl sm:text-2xl m-0 ${current.fontClass}`}>
                            {current.nav.print}
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex min-h-0 relative bg-black/20 border border-white/5">
                    {/* Left Panel: Options */}
                    <div className="w-64 bg-black/40 border-r border-white/10 p-4 flex flex-col gap-4 z-10">
                        <h3 className={`text-white text-sm m-0 opacity-80 flex items-center gap-2 ${current.fontClass}`}>
                            <Icon icon="pixelarticons:book-open" />
                            {current.print.itemInfo}
                        </h3>

                        {/* Model Selection */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-white/40 text-[10px] uppercase tracking-wider">Select Model</label>
                            <select
                                value={modelType}
                                onChange={(e) => {
                                    const newType = e.target.value;
                                    setModelType(newType);
                                    const selected = availableModels.find(m => m.model_type === newType);
                                    if (selected) {
                                        setIsSoldOut(!selected.available);
                                        setPrice(selected.price);
                                    }
                                }}
                                className="w-full bg-white/5 border border-white/10 text-white text-xs p-2 rounded outline-none focus:border-white/20 transition-colors cursor-pointer"
                            >
                                {availableModels.map(m => (
                                    <option key={m.model_type} value={m.model_type} className="bg-zinc-900 text-white">
                                        {m.model_type} - ${m.price} {!m.available ? '(Sold Out)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 bg-white/5 border border-white/10 p-3 mt-4">
                            <div className="flex justify-between items-center border-b border-white/5 pb-1">
                                <span className={`text-white/60 text-xs ${current.fontClass}`}>
                                    {current.print.specs}
                                </span>
                            </div>
                            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-white/80 text-[11px] mt-2">
                                <span className="text-white/40 text-[10px] whitespace-nowrap">Model Type:</span>
                                <span className="font-mono text-[10px] text-right break-words leading-tight">{modelType}</span>

                                <span className="text-white/40 text-[10px] whitespace-nowrap">{current.print.materialLabel}:</span>
                                <span className="font-mono text-[10px] text-right break-words leading-tight">{current.print.materialDetail}</span>

                                <span className="text-white/40 text-[10px] whitespace-nowrap">{current.print.dimensionsLabel}:</span>
                                <span className="font-mono text-[10px] text-right break-words leading-tight">{current.print.dimensionsDetail}</span>
                            </div>
                        </div>

                        {/* Age Warning */}
                        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-yellow-500/5 border border-yellow-500/10 mt-2">
                            <span className="text-[9px] font-bold text-yellow-500/80 border border-yellow-500/20 px-0.5 rounded leading-none">14+</span>
                            <span className={`text-white/40 text-[9px] leading-tight ${current.fontClass}`}>{current.print.ageWarning}</span>
                        </div>

                        {/* Address Selection */}
                        <div className="bg-white/5 p-2 rounded border border-white/10 flex flex-col gap-1 mt-4">
                            <div className="flex justify-between items-center">
                                <span className="text-white/60 text-[10px]">{current.print.shipTo}</span>
                                <button onClick={() => setIsAddressOpen(true)} className="text-green-500 text-[10px] hover:underline cursor-pointer border-none bg-transparent">
                                    {current.print.change}
                                </button>
                            </div>
                            {selectedAddress ? (
                                <div className="text-white/80 text-[11px] font-bold truncate">
                                    {selectedAddress.state} {selectedAddress.city} - {selectedAddress.detail_address}
                                </div>
                            ) : (
                                <div className="text-white/40 text-[10px]">{current.print.noAddress}</div>
                            )}
                        </div>


                        {/* Order Actions */}
                        <div className="mt-auto flex flex-col gap-2">
                            {isSoldOut && (
                                <div className="bg-red-500/10 border border-red-500/30 p-2 rounded text-red-500 text-[10px] flex items-center gap-1">
                                    <Icon icon="pixelarticons:warning-box" />
                                    <span>{current.print.soldOut}</span>
                                </div>
                            )}
                            <button
                                onClick={handleCreateOrder}
                                disabled={isUploading || isSoldOut}
                                className={`w-full py-3 ${isSoldOut ? 'bg-gray-500 cursor-not-allowed opacity-60' : 'bg-[#3c8527] hover:bg-[#4ea632]'} text-white border-2 border-black cursor-pointer transition-all flex items-center justify-center gap-2 text-xs lg:text-sm active:transform active:translate-y-0.5 ${current.fontClass} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isUploading ? (
                                    <span className="animate-pulse">{current.orders.loading}</span>
                                ) : isSoldOut ? (
                                    <>
                                        <Icon icon="pixelarticons:close" />
                                        {current.print.soldOut}
                                    </>
                                ) : (
                                    <>
                                        <Icon icon="pixelarticons:check" />
                                        {current.print.continue}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Right Area: 3D Preview */}

                    <div className="flex-1 min-w-0 relative">
                        <MC textureUrl={displayTextureUrl} mode={mode} action={action} visibleParts={visibleParts} showOverlay={showOverlay} showEdges={false} printMode={true} />

                        {/* Simplified Character Toggler Bottom Right */}
                        <div className="absolute bottom-4 right-4 pointer-events-auto bg-black/40 backdrop-blur-md p-4 border border-white/10 flex flex-col items-center gap-1.5 z-20">
                            <div
                                onClick={() => togglePart('head')}
                                className={`w-5 h-5 cursor-pointer border-2 transition-colors ${visibleParts.head ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`}
                            />
                            <div className="flex gap-1">
                                <div onClick={() => togglePart('rightArm')} className={`w-2.5 h-8 cursor-pointer border-2 transition-colors ${visibleParts.rightArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('body')} className={`w-5 h-8 cursor-pointer border-2 transition-colors ${visibleParts.body ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('leftArm')} className={`w-2.5 h-8 cursor-pointer border-2 transition-colors ${visibleParts.leftArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                            </div>
                            <div className="flex gap-1">
                                <div onClick={() => togglePart('rightLeg')} className={`w-2.5 h-8 cursor-pointer border-2 transition-colors ${visibleParts.rightLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('leftLeg')} className={`w-2.5 h-8 cursor-pointer border-2 transition-colors ${visibleParts.leftLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AddressManager
                isOpen={isAddressOpen}
                onClose={() => setIsAddressOpen(false)}
                current={current}
                onSelect={(addr) => {
                    setSelectedAddress(addr);
                    setIsAddressOpen(false);
                }}
            />
        </div>
    );
}

