import { Icon } from '@iconify/react'
import { useState, useEffect, useRef } from 'react'
import { type LangData } from '../constants/lang'
import { apiFetch } from '../utils/api'

interface PayModalProps {
    isOpen: boolean;
    orderId: string | null;
    totalPrice: number | null;
    tierKey?: string | null;
    current: LangData;
    isSubscription?: boolean;
    isUpgrade?: boolean;
    existingSubscriptionId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export function PayModal({ isOpen, orderId, totalPrice, tierKey, current, isSubscription, isUpgrade, existingSubscriptionId, onClose, onSuccess }: PayModalProps) {
    const [isLoadingClient, setIsLoadingClient] = useState(true);
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);
    const [clientId, setClientId] = useState<string>('');
    const [planId, setPlanId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    const paypalButtonRef = useRef<HTMLDivElement>(null);
    const renderedButtonRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen && (orderId || isSubscription)) {
            fetchClientId();
        }
    }, [isOpen, orderId, isSubscription]);

    const fetchClientId = async () => {
        try {
            setIsLoadingClient(true);
            const response = await apiFetch('/api/orders/paypal/config');
            if (response.ok) {
                const data = await response.json();
                setClientId(data.client_id);
                
                // Determine which plan ID to use based on the tierKey
                if (isSubscription) {
                    if (tierKey === 'pro_max') {
                        setPlanId(data.pro_max_plan_id);
                    } else {
                        setPlanId(data.pro_plus_plan_id);
                    }
                }
                
                loadPayPalSdk(data.client_id);
            }
        } catch (e) {
            console.error("Failed to fetch client id/plan id", e);
        } finally {
            setIsLoadingClient(false);
        }
    };

    const loadPayPalSdk = (id: string) => {
        if (window.paypal) {
            setIsSdkLoaded(true);
            return;
        }

        const script = document.createElement('script');
        let sdkUrl = `https://www.paypal.com/sdk/js?client-id=${id}&currency=USD`;
        if (isSubscription) {
            sdkUrl += '&vault=true&intent=subscription';
        }
        script.src = sdkUrl;
        script.async = true;
        script.onload = () => {
            setIsSdkLoaded(true);
        };
        document.body.appendChild(script);
    };

    useEffect(() => {
        if (isSdkLoaded && paypalButtonRef.current && clientId && isOpen && (orderId || isSubscription) && !isLoadingClient) {
            renderPaypalButtons();
        }

        return () => {
            if (renderedButtonRef.current && renderedButtonRef.current.close) {
                try {
                    renderedButtonRef.current.close().catch(() => { });
                } catch (e) { }
                renderedButtonRef.current = null;
            }
        }
    }, [isSdkLoaded, clientId, isOpen, orderId, isLoadingClient]);

    const renderPaypalButtons = () => {
        if (!window.paypal || !paypalButtonRef.current) return;

        if (renderedButtonRef.current && renderedButtonRef.current.close) {
            try {
                renderedButtonRef.current.close().catch(() => { });
            } catch (e) { }
            renderedButtonRef.current = null;
        }

        paypalButtonRef.current.innerHTML = '';

        if (isSubscription) {
            renderedButtonRef.current = window.paypal.Buttons({
                createSubscription: async (_: any, actions: any) => {
                    const token = localStorage.getItem('token');
                    if (!token) return;
                    setIsProcessing(true);
                    
                    if (isUpgrade && existingSubscriptionId) {
                        return actions.subscription.revise(existingSubscriptionId, {
                            plan_id: planId
                        });
                    }

                    return actions.subscription.create({
                        plan_id: planId
                    });
                },
                onApprove: async (data: any, _actions: any) => {
                    const token = localStorage.getItem('token');
                    if (!token) return;
                    try {
                        const activateRes = await apiFetch(`/api/orders/subscription/activate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paypal_order_id: data.subscriptionID })
                        });

                        if (activateRes.ok) {
                            window.dispatchEvent(new Event('user-updated'));
                            onSuccess();
                        } else {
                            const err = await activateRes.json();
                            alert(err.detail || 'Activation Failed');
                        }
                    } catch (e) {
                        alert('Payment Confirmation Failed');
                    } finally {
                        setIsProcessing(false);
                    }
                },
                onCancel: () => setIsProcessing(false),
                onError: (err: any) => { console.error('PayPal Error:', err); setIsProcessing(false); }
            });
        } else {
            renderedButtonRef.current = window.paypal.Buttons({
                createOrder: async () => {
                    const token = localStorage.getItem('token');
                    if (!token) return;

                    setIsProcessing(true);
                    try {
                        const paypalRes = await apiFetch(`/api/orders/${orderId}/create-paypal-order`, {
                            method: 'POST'
                        });

                        if (!paypalRes.ok) {
                            const err = await paypalRes.json();
                            throw new Error(err.detail || 'Failed to create PayPal order');
                        }

                        const paypalData = await paypalRes.json();
                        return paypalData.id;

                    } catch (e: any) {
                        alert(e.message);
                        setIsProcessing(false);
                        throw e;
                    }
                },
                onApprove: async (data: any, _actions: any) => {
                    const token = localStorage.getItem('token');
                    if (!token) return;

                    try {
                        const captureRes = await apiFetch(`/api/orders/${orderId}/pay`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                paypal_order_id: data.orderID
                            })
                        });

                        if (captureRes.ok) {
                            window.dispatchEvent(new Event('user-updated'));
                            onSuccess();
                        } else {
                            const err = await captureRes.json();
                            alert(err.detail || 'Capture Failed');
                        }
                    } catch (e) {
                        alert('Payment Confirmation Failed');
                    } finally {
                        setIsProcessing(false);
                    }
                },
                onCancel: () => {
                    setIsProcessing(false);
                },
                onError: (err: any) => {
                    console.error('PayPal Error:', err);
                    setIsProcessing(false);
                }
            });
        }

        renderedButtonRef.current.render(paypalButtonRef.current);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-black/80 border border-white/10 p-6 max-w-md w-full flex flex-col gap-4 animate-in zoom-in duration-200 text-white">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <h2 className={`text-lg font-bold ${current.fontClass}`}>
                        {current.modal.payOrder}
                    </h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white cursor-pointer">
                        <Icon icon="pixelarticons:close" className="text-lg" />
                    </button>
                </div>

                <div className="flex flex-col gap-1 text-sm">
                    {!isSubscription && (
                        <div className="flex justify-between">
                            <span className={`text-white/40 ${current.fontClass}`}>{current.orders.orderId}:</span>
                            <span className="font-mono text-white/80">{orderId?.split('-')[0].toUpperCase()}</span>
                        </div>
                    )}
                    {!isUpgrade && (
                        <div className="flex justify-between">
                            <span className={`text-white/40 ${current.fontClass}`}>{current.orders.totalAmount}:</span>
                            <span className="text-green-500 font-bold">${totalPrice}</span>
                        </div>
                    )}
                    {isUpgrade && (
                        <div className="flex justify-between">
                            <span className={`text-white/40 ${current.fontClass}`}>{current.orders.totalAmount}:</span>
                            <span className="text-white/60 text-xs text-right w-2/3 leading-tight">
                                {current.modal.paypalProratedDifference}
                            </span>
                        </div>
                    )}
                </div>

                <div className="border-t border-white/5 pt-3">
                    {isLoadingClient ? (
                        <div className="text-center font-mono text-xs text-white/40 py-4">{current.modal.loadingConfig}</div>
                    ) : (
                        <div className={`w-full ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div ref={paypalButtonRef}></div>
                        </div>
                    )}

                    {isProcessing && (
                        <div className="text-center text-xs text-green-500 animate-pulse mt-2">{current.modal.processingPayment}</div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className={`mt-2 border border-white/10 hover:bg-white/5 text-white/60 hover:text-white px-3 py-1.5 text-xs text-center cursor-pointer transition-colors ${current.fontClass}`}
                >
                    {current.modal.cancel}
                </button>
            </div>
        </div>
    );
}
