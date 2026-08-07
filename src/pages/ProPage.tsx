import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { apiFetch } from '../utils/api'
import { SEO } from '../components/SEO'

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
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    const plans: Plan[] = [
        { key: 'pro_plus', duration: current.pro.plansData.pro_plus, price: 8, popular: true },
        { key: 'pro_max', duration: current.pro.plansData.pro_max, price: 20 }
    ];

    const handleSubscribe = async (tier: any, _isUpgrade: boolean = false) => {
        const token = localStorage.getItem('token');
        if (!token) {
            alert(current.common.authRequired);
            return;
        }

        setIsProcessing(true);
        try {
            const returnUrl = window.location.origin + '/credits?payment_redirect=1';
            const res = await apiFetch('/api/orders/subscription/create', {
                method: 'POST',
                body: JSON.stringify({
                    tier: tier.key,
                    return_url: returnUrl
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to create subscription');
            }

            const data = await res.json(); // { approval_url, subscription_id }

            const width = 600;
            const height = 700;
            const left = window.screenX + (window.innerWidth - width) / 2;
            const top = window.screenY + (window.innerHeight - height) / 2;
            const popup = window.open(
                data.approval_url,
                'paypal_checkout',
                `width=${width},height=${height},left=${left},top=${top}`
            );

            if (!popup) {
                alert('Please allow pop-ups to complete payment');
                setIsProcessing(false);
                return;
            }

            const subscriptionId = data.subscription_id;
            const pollTimer = setInterval(async () => {
                if (popup.closed) {
                    clearInterval(pollTimer);
                    try {
                        const activateRes = await apiFetch('/api/orders/subscription/activate', {
                            method: 'POST',
                            body: JSON.stringify({ paypal_order_id: subscriptionId })
                        });

                        if (activateRes.ok) {
                            window.dispatchEvent(new Event('user-updated'));
                            alert(current.pro.successMessage);
                            fetchUserProfile();
                            navigate('/skin/');
                        } else {
                            const err = await activateRes.json();
                            alert(err.detail || 'Activation Failed');
                        }
                    } catch (e) {
                        alert('Payment Confirmation Failed');
                    } finally {
                        setIsProcessing(false);
                    }
                }
            }, 1000);

        } catch (e: any) {
            alert(e.message || 'Payment initialization failed');
            setIsProcessing(false);
        }
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
        const handleLogoutEvent = () => {
            setUserProfile(null);
        };
        window.addEventListener('user-updated', handleUserUpdate);
        window.addEventListener('logout', handleLogoutEvent);
        return () => {
            window.removeEventListener('user-updated', handleUserUpdate);
            window.removeEventListener('logout', handleLogoutEvent);
        };
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
        <PageContainer>
            <SEO title={current.nav.pro} description={current.pro.benefits} />

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
                                        <Icon icon="pixelarticons:briefcase" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.commercial}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Icon icon="pixelarticons:flag" className={`text-lg mt-0.5 ${tier.styles.icon}`} />
                                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>{tier.perks.experimental}</span>
                                    </div>
                                </div>

                                 {tier.key === 'free' ? (
                                     <></>
                                 ) : (
                                     <div className="flex flex-col gap-1.5 mt-auto">
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
                                             disabled={isCancelling || isProcessing || isLowerTier}
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
                                                     {isProcessing ? (
                                                         <Icon icon="pixelarticons:reload" className="animate-spin" />
                                                     ) : (
                                                         <Icon icon="pixelarticons:check" />
                                                     )}
                                                     {isUpgrade ? current.pro.upgrade : current.pro.subscribe}
                                                 </>
                                             )}
                                         </button>
                                         <div className="flex items-center justify-end gap-1 px-1.5 py-0.5 opacity-40 hover:opacity-75 transition-opacity text-[10px] select-none font-mono">
                                             <span>via</span>
                                             <Icon icon="fa6-brands:paypal" className="text-[#0079C1] text-xs shrink-0" />
                                             <span className="font-bold">PayPal</span>
                                         </div>
                                     </div>
                                 )}
                            </div>
                        );
                    })}
                </div>

                {/* Credits Redirect Tip Banner */}
                <div className="border border-[#a6df7a]/20 bg-[#a6df7a]/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-0 mb-6 relative overflow-hidden">
                    <div className="flex items-center gap-3">
                        <Icon icon="pixelarticons:zap" className="text-xl text-[#a6df7a] animate-pulse shrink-0" />
                        <span className={`text-xs text-white/70 leading-relaxed ${current.fontClass}`}>
                            {current.pro.buyCreditsTip}
                        </span>
                    </div>
                    <button
                        onClick={() => navigate('/credits')}
                        className={`flex items-center gap-1.5 border border-[#a6df7a]/40 bg-[#a6df7a]/12 hover:bg-[#a6df7a]/20 px-4 py-2 text-xs font-bold text-[#a6df7a] hover:text-[#a6df7a] hover:shadow-[0_0_12px_rgba(166,223,122,0.12)] cursor-pointer transition-all self-start sm:self-center shrink-0 ${current.fontClass}`}
                    >
                        <span>{current.pro.buyCreditsBtn}</span>
                        <Icon icon="pixelarticons:arrow-right" className="text-xs" />
                    </button>
                </div>

                {/* Footer Info */}
                <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
                    <div className={`text-[10px] text-white/40 flex items-center gap-2 ${current.fontClass}`}>
                        <Icon icon="pixelarticons:mail" className="text-sm shrink-0" />
                        <span>
                            {current.pro.supportText}
                            <a href="mailto:support@entropydrop.com" className="text-white/60 hover:text-white transition-colors cursor-pointer underline ml-1">support@entropydrop.com</a>
                        </span>
                    </div>
                </div>

        </PageContainer>
    );
}
