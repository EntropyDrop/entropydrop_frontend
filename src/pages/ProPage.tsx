import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { apiFetch } from '../utils/api'
import { PayModal } from '../components/PayModal';

interface ProPageProps {
    current: LangData
}

interface Plan {
    key: string;
    duration: string;
    price: number;
    originalPrice?: number;
    popular?: boolean;
}

declare global {
    interface Window {
        paypal: any;
    }
}

export function ProPage({ current }: ProPageProps) {
    const navigate = useNavigate();
    const [userProfile, setUserProfile] = useState<any>(null);
    const [isCreatingOrder, _] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [payModalConfig, setPayModalConfig] = useState<{
        isOpen: boolean;
        orderId: string | null;
        totalPrice: number | null;
        tierKey: string | null;
        isUpgrade?: boolean;
        existingSubscriptionId?: string;
    }>({
        isOpen: false,
        orderId: null,
        totalPrice: null,
        tierKey: null,
        isUpgrade: false,
        existingSubscriptionId: undefined
    });

    const plans: Plan[] = [
        { key: 'pro_plus', duration: current.pro.plansData.pro_plus, price: 8, popular: true },
        { key: 'pro_max', duration: current.pro.plansData.pro_max, price: 20 }
    ];

    const handleSubscribe = async (tier: any, isUpgrade: boolean = false) => {
        const token = localStorage.getItem('token');
        if (!token) {
            alert(current.common.authRequired);
            return;
        }

        setPayModalConfig({
            isOpen: true,
            orderId: null,
            totalPrice: tier.price,
            tierKey: tier.key,
            isUpgrade,
            existingSubscriptionId: isUpgrade ? userProfile?.paypal_subscription_id : undefined
        });
    };

    const fetchUserProfile = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await apiFetch('/api/users/me');
            if (res.ok) {
                const data = await res.json();
                setUserProfile(data);
            }
        } catch (e) {
            console.error('Failed to fetch user profile', e);
        }
    };

    useEffect(() => {
        fetchUserProfile();

        const handleUserUpdate = () => {
            fetchUserProfile();
        };
        window.addEventListener('user-updated', handleUserUpdate);
        return () => window.removeEventListener('user-updated', handleUserUpdate);
    }, []);

    const handleCancelSubscription = async () => {
        if (!confirm(current.pro.cancelConfirm)) return;
        setIsCancelling(true);
        try {
            const res = await apiFetch('/api/users/me/cancel_subscription', { method: 'POST' });
            if (res.ok) {
                alert(current.pro.cancelSuccess);
                fetchUserProfile();
            } else {
                const err = await res.json();
                alert(err.detail || current.pro.cancelFailed);
            }
        } catch (e) {
            alert(current.common.connectError);
        } finally {
            setIsCancelling(false);
        }
    };

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-2 sm:p-8 lg:p-12 pt-20 sm:pt-24 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            <div className="w-full max-w-7xl h-full bg-black/40 backdrop-blur-md p-4 sm:p-8 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto text-white animate-in fade-in duration-300 flex flex-col gap-6">

                {/* Header */}
                <div className="flex flex-col gap-2 border-b border-white/10 pb-6">
                    <h1 className={`text-2xl sm:text-3xl font-bold ${current.fontClass}`}>
                        {current.pro.title}
                    </h1>
                    <p className={`text-white/60 text-sm ${current.fontClass}`}>
                        {current.pro.benefits}
                    </p>
                </div>

                {/* Tiers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {[
                        {
                            key: 'free',
                            perks: current.pro.perks.free,
                            icon: 'pixelarticons:user',
                            isCurrent: !userProfile?.is_pro,
                            styles: {
                                border: 'border-white/10',
                                bg: 'bg-white/5',
                                activeBorder: 'border-white/40',
                                activeBg: 'bg-white/10',
                                ring: 'ring-white/20',
                                text: 'text-white',
                                icon: 'text-white/70',
                                button: 'bg-white/20 hover:bg-white/30 text-white'
                            }
                        },
                        {
                            key: 'pro_plus',
                            perks: current.pro.perks.pro_plus,
                            icon: 'pixelarticons:zap',
                            popular: true,
                            isCurrent: userProfile?.pro_level === 'pro-plus' && userProfile?.paypal_subscription_status === 'ACTIVE',
                            styles: {
                                border: 'border-green-500/20',
                                bg: 'bg-green-500/5',
                                activeBorder: 'border-green-500',
                                activeBg: 'bg-green-500/10',
                                ring: 'ring-green-500/50',
                                text: 'text-green-500',
                                icon: 'text-green-500/70',
                                button: 'bg-green-500 hover:bg-green-600 text-black'
                            }
                        },
                        {
                            key: 'pro_max',
                            perks: current.pro.perks.pro_max,
                            icon: 'pixelarticons:zap',
                            isCurrent: userProfile?.pro_level === 'pro-max' && userProfile?.paypal_subscription_status === 'ACTIVE',
                            styles: {
                                border: 'border-purple-500/20',
                                bg: 'bg-purple-500/5',
                                activeBorder: 'border-purple-500',
                                activeBg: 'bg-purple-500/10',
                                ring: 'ring-purple-500/50',
                                text: 'text-purple-500',
                                icon: 'text-purple-500/70',
                                button: 'bg-purple-500 hover:bg-purple-600 text-black'
                            }
                        }
                    ].map((tier) => {
                        const isUpgrade = tier.key === 'pro_max' && userProfile?.pro_level === 'pro-plus' && userProfile?.paypal_subscription_status === 'ACTIVE';
                        const userLevel = userProfile?.paypal_subscription_status === 'ACTIVE'
                            ? (userProfile?.pro_level === 'pro-max' ? 2 : (userProfile?.pro_level === 'pro-plus' ? 1 : 0))
                            : 0;
                        const tierLevel = tier.key === 'pro_max' ? 2 : (tier.key === 'pro_plus' ? 1 : 0);
                        const isLowerTier = tierLevel < userLevel;

                        return (
                            <div
                                key={tier.key}
                                className={`relative flex flex-col p-6 border transition-all duration-300 ${tier.isCurrent
                                    ? `${tier.styles.activeBorder} ${tier.styles.activeBg} ring-1 ${tier.styles.ring}`
                                    : `${tier.styles.border} ${tier.styles.bg} hover:border-white/30`
                                    }`}
                            >
                                {tier.popular && (
                                    <span className={`absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-black font-bold text-[10px] px-3 py-1 uppercase tracking-wider ${current.fontClass}`}>
                                        {current.pro.recommended}
                                    </span>
                                )}

                                {tier.isCurrent && (
                                    <div className={`absolute -top-3 right-4 px-2 py-1 flex items-center gap-1 text-black font-bold text-[10px] ${tier.key === 'free' ? 'bg-white' : (tier.key === 'pro_plus' ? 'bg-green-500' : 'bg-purple-500')} ${current.fontClass}`}>
                                        <Icon icon="pixelarticons:check-double" />
                                        {current.pro.currentPlan}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 border ${tier.key === 'free' ? 'bg-white/10 border-white/20' : (tier.key === 'pro_plus' ? 'bg-green-500/10 border-green-500/20' : 'bg-purple-500/10 border-purple-500/20')}`}>
                                        <Icon icon={tier.icon} className={`text-2xl ${tier.styles.text}`} />
                                    </div>
                                    <h3 className={`text-lg font-bold ${current.fontClass}`}>{tier.perks.title}</h3>
                                </div>

                                <div className="flex items-baseline gap-1 mb-8">
                                    <span className={`text-3xl font-bold ${current.fontClass} ${tier.styles.text}`}>${tier.perks.price}</span>
                                    <span className={`text-white/40 text-xs ${current.fontClass}`}>/ {current.pro.plansData.month}</span>
                                </div>

                                <div className="flex-1 flex flex-col gap-4 mb-8">
                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:image" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.quota}</span>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:lock" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.private}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:folder" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.collections}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:zap" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.priority}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:flag" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.experimental}</span>
                                    </div>
                                </div>

                                {tier.key === 'free' ? (
                                    <></>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (tier.isCurrent) {
                                                handleCancelSubscription();
                                            } else {
                                                // Find the plan data to pass it directly
                                                const planData = plans.find(p => p.key === tier.key) || { key: tier.key, price: tier.key === 'pro_max' ? 20 : 8 };
                                                handleSubscribe(planData, isUpgrade);
                                            }
                                        }}
                                        disabled={isCancelling || isCreatingOrder || isLowerTier}
                                        className={`w-full py-3 font-bold transition-all flex items-center justify-center gap-2 text-sm ${tier.isCurrent
                                            ? 'bg-red-500 hover:bg-red-600 text-black border border-red-400'
                                            : isLowerTier
                                                ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
                                                : `${tier.styles.button} border border-black/10`
                                            } ${current.fontClass}`}
                                    >
                                        {tier.isCurrent ? (
                                            <>
                                                <Icon icon="pixelarticons:close" className={isCancelling ? 'animate-spin' : ''} />
                                                {current.pro.cancel}
                                            </>
                                        ) : (
                                            <>
                                                <Icon icon="pixelarticons:check" />
                                                {isUpgrade ? current.pro.upgrade : current.pro.subscribe}
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer Info */}
                <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
                    {userProfile?.paypal_subscription_status === 'ACTIVE' && (
                        <div className={`text-[10px] text-red-400/80 flex items-center gap-2 ${current.fontClass}`}>
                            <Icon icon="pixelarticons:info-box" className="text-sm shrink-0" />
                            {current.pro.cancelWarning}
                        </div>
                    )}
                    <div className={`text-[10px] text-white/40 flex items-center gap-2 ${current.fontClass}`}>
                        <Icon icon="pixelarticons:mail" className="text-sm shrink-0" />
                        <span>
                            {current.pro.supportText}
                            <a href="mailto:support@entropydrop.com" className="text-white/60 hover:text-white transition-colors cursor-pointer underline ml-1">support@entropydrop.com</a>
                        </span>
                    </div>
                </div>

                <PayModal
                    isOpen={payModalConfig.isOpen}
                    orderId={payModalConfig.orderId}
                    totalPrice={payModalConfig.totalPrice}
                    tierKey={payModalConfig.tierKey}
                    current={current}
                    isSubscription={true}
                    isUpgrade={payModalConfig.isUpgrade}
                    existingSubscriptionId={payModalConfig.existingSubscriptionId}
                    userId={userProfile?.id}
                    onClose={() => setPayModalConfig(prev => ({ ...prev, isOpen: false }))}
                    onSuccess={() => {
                        setPayModalConfig(prev => ({ ...prev, isOpen: false }));
                        alert(current.pro.successMessage);
                        navigate('/skin/');
                    }}
                />
            </div>
        </div>
    );
}
