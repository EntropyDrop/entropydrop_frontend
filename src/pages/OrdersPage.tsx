import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { Skin2DImg } from '../components/Skin2DImg';
import { ConfirmModal } from '../components/ConfirmModal';
import { apiFetch } from '../utils/api';
import { PayModal } from '../components/PayModal';
import { Skin3DModal } from '../components/Skin3DModal';
import { formatDate } from '../utils/date';

interface OrdersPageProps {
    current: LangData
}

interface OrderItem {
    id: string;
    order_id: string;
    skin_url?: string;
    model_type: string;
    price: number;
    created_at: string;
}

interface Order {
    id: string;
    address_id?: string;
    order_type?: string;
    status: string;
    price: number;
    shipping_fee: number;
    total_price: number;
    created_at: string;
    paid_at?: string;
    items?: OrderItem[];
    address?: {
        country: string;
        state: string;
        city: string;
        detail_address: string;
        phone: string;
    }
}

export function OrdersPage({ current }: OrdersPageProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'error' | 'warning' | 'success';
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const [payModalConfig, setPayModalConfig] = useState<{
        isOpen: boolean;
        orderId: string | null;
        totalPrice: number | null;
    }>({
        isOpen: false,
        orderId: null,
        totalPrice: null
    });

    const [skin3DModalConfig, setSkin3DModalConfig] = useState<{
        isOpen: boolean;
        textureUrl: string | null;
    }>({
        isOpen: false,
        textureUrl: null
    });

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async (pageNum = 1, append = false) => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/skin/');
            return;
        }

        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            const response = await apiFetch(`/api/orders?page=${pageNum}&page_size=10`);
            if (response.ok) {
                const data = await response.json();
                if (append) {
                    setOrders(prev => [...prev, ...data.items]);
                } else {
                    setOrders(data.items);
                }
                setHasMore(pageNum < data.total_pages);
                setPage(pageNum);
            } else {
                setError('Failed to fetch orders');
            }
        } catch (e) {
            setError('Network error');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleCancelOrder = (orderId: string) => {
        setModalConfig({
            isOpen: true,
            title: current.orders.cancelOrder,
            message: current.orders.confirmCancel,
            type: 'warning',
            onConfirm: () => executeCancelOrder(orderId)
        });
    };

    const executeCancelOrder = async (orderId: string) => {
        try {
            const response = await apiFetch(`/api/orders/${orderId}/cancel`, {
                method: 'PUT'
            });
            if (response.ok) {
                setModalConfig({ isOpen: true, title: current.orders.tip, message: current.orders.cancelSuccess, type: 'success' });
                fetchOrders();
            } else {
                setModalConfig({ isOpen: true, title: current.orders.cancelFailed, message: current.orders.operationFailed, type: 'error' });
            }
        } catch (e) {
            setModalConfig({ isOpen: true, title: current.orders.networkTitle, message: current.orders.networkError, type: 'error' });
        }
    };

    const handleAddToOrder = async () => {
        setModalConfig({
            isOpen: true,
            title: current.orders.addToPendingOrderTitle,
            message: current.orders.addToPendingOrderHint,
            type: 'info',
            onConfirm: () => navigate('/skin/'),
        });
    };

    const handleDeleteOrderItem = (itemId: string) => {
        setModalConfig({
            isOpen: true,
            title: current.orders.deleteOrder,
            message: current.orders.confirmDelete,
            type: 'error',
            onConfirm: () => executeDeleteOrderItem(itemId)
        });
    };

    const executeDeleteOrderItem = async (itemId: string) => {
        try {
            const response = await apiFetch(`/api/orders/items/${itemId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setModalConfig({ isOpen: true, title: current.orders.tip, message: current.orders.deleteSuccess, type: 'success' });
                fetchOrders();
            } else {
                setModalConfig({ isOpen: true, title: current.orders.deleteFailed, message: current.orders.operationFailed, type: 'error' });
            }
        } catch (e) {
            setModalConfig({ isOpen: true, title: current.orders.networkTitle, message: current.orders.networkError, type: 'error' });
        }
    };

    const handleDeleteOrder = (orderId: string) => {
        setModalConfig({
            isOpen: true,
            title: current.orders.deleteOrder,
            message: current.orders.confirmDeleteOrder,
            type: 'error',
            onConfirm: () => executeDeleteOrder(orderId)
        });
    };

    const executeDeleteOrder = async (orderId: string) => {
        try {
            const response = await apiFetch(`/api/orders/${orderId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setModalConfig({ isOpen: true, title: current.orders.tip, message: current.orders.deleteSuccess, type: 'success' });
                fetchOrders();
            } else {
                const data = await response.json();
                setModalConfig({ isOpen: true, title: current.orders.deleteFailed, message: data.detail || current.orders.operationFailed, type: 'error' });
            }
        } catch (e) {
            setModalConfig({ isOpen: true, title: current.orders.networkTitle, message: current.orders.networkError, type: 'error' });
        }
    };

    const getStatusBadge = (status: string) => {
        const styleMap: { [key: string]: string } = {
            'pending_payment': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
            'paid': 'bg-green-500/20 text-green-500 border-green-500/30',
            'shipping': 'bg-blue-500/20 text-blue-500 border-blue-500/30',
            'completed': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            'cancelled': 'bg-red-500/20 text-red-500 border-red-500/30'
        };
        const textMap: { [key: string]: string } = {
            'pending_payment': current.orders.statuses.pending_payment,
            'paid': current.orders.statuses.paid,
            'shipping': current.orders.statuses.shipping,
            'completed': current.orders.statuses.completed,
            'cancelled': current.orders.statuses.cancelled
        };
        const displayStatus = textMap[status] || status;
        const style = styleMap[status] || 'bg-white/10 text-white border-white/20';

        return (
            <span className={`px-2 py-0.5 text-[10px] border ${style}`}>
                {displayStatus}
            </span>
        );
    };

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            {/* Modal */}
            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                onConfirm={modalConfig.onConfirm}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false, onConfirm: undefined }))}
                current={current}
            />
            <PayModal
                isOpen={payModalConfig.isOpen}
                orderId={payModalConfig.orderId}
                totalPrice={payModalConfig.totalPrice}
                current={current}
                onClose={() => setPayModalConfig(prev => ({ ...prev, isOpen: false }))}
                onSuccess={() => {
                    setPayModalConfig(prev => ({ ...prev, isOpen: false }));
                    setModalConfig({ isOpen: true, title: current.orders.tip, message: current.modal.paySuccess, type: 'success' });
                    fetchOrders();
                }}
            />
            <Skin3DModal
                isOpen={skin3DModalConfig.isOpen}
                onClose={() => setSkin3DModalConfig(prev => ({ ...prev, isOpen: false }))}
                textureUrl={skin3DModalConfig.textureUrl}
                current={current}
            />
            <div className={`w-full max-w-4xl h-full flex flex-col gap-4 bg-black/40 backdrop-blur-md p-6 border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-300 pointer-events-auto ${current.fontClass}`}>
                {/* Header */}
                <div className="flex justify-between items-end border-b border-white/10 pb-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <h2 className={`text-white text-xl sm:text-2xl m-0 ${current.fontClass}`}>
                            {current.user.orders}
                        </h2>
                    </div>
                    <div className="text-[10px] text-white/40 flex items-center gap-1">
                        <Icon icon="pixelarticons:mail" />
                        {current.orders.support}
                        <a href="mailto:support@entropydrop.com" className="text-green-400 hover:text-green-300 transition-colors cursor-pointer select-all">support@entropydrop.com</a>
                    </div>
                </div>


                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2">
                    {loading ? (
                        <div className="text-white/40 text-sm py-10 text-center flex items-center justify-center gap-2">
                            <Icon icon="pixelarticons:reload" className="animate-spin" />
                            {current.orders.loading}
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-sm py-10 text-center">
                            {error}
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="text-white/40 text-sm py-10 text-center">
                            {current.orders.noOrders}
                        </div>
                    ) : (
                        <>
                            {orders.map(order => (
                                <div key={order.id} className="bg-white/5 border border-white/10 p-4 flex flex-col gap-3 hover:bg-white/10 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-bold text-xs">
                                                    {current.orders.orderId}: {order.id.split('-')[0].toUpperCase()}
                                                </span>
                                                {getStatusBadge(order.status)}
                                            </div>
                                            <span className="text-white/40 text-[10px]">
                                                {current.orders.orderTime}: {formatDate(order.created_at)}
                                            </span>
                                            {order.paid_at && (
                                                <span className="text-white/40 text-[10px]">
                                                    {current.orders.payTime}: {formatDate(order.paid_at)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-green-500 font-bold text-sm">
                                                ${order.total_price}
                                            </span>
                                            <span className="text-white/40 text-[8px]">
                                                ({current.orders.shippingFee}: ${order.shipping_fee})
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-white/60 text-xs flex items-center gap-1">
                                                <Icon icon="pixelarticons:box" className="text-xs" />
                                                {order.order_type === 'subscription' ? current.orders.subscription : current.orders.orderItems}
                                            </span>
                                            <div className="flex flex-col gap-1.5 pl-4 mt-1">
                                                {order.items?.map((item) => (
                                                    <div key={item.id} className="flex gap-2 items-center text-[10px] text-white/40 bg-white/5 p-1.5 relative group">
                                                        {item.skin_url && (
                                                            <div
                                                                onClick={() => setSkin3DModalConfig({ isOpen: true, textureUrl: item.skin_url! })}
                                                                className="cursor-pointer shrink-0 w-14 h-14"
                                                            >
                                                                <Skin2DImg src={item.skin_url} className="w-14 h-14 object-cover bg-black/40 border border-white/5 shrink-0" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1">
                                                            {order.order_type === 'subscription' ? (
                                                                <div>{(current.orders.subscriptions as any)[item.model_type || ''] || item.model_type}</div>
                                                            ) : (
                                                                <div>{item.model_type} (${item.price})</div>
                                                            )}
                                                        </div>
                                                        {order.status === 'pending_payment' && order.order_type !== 'subscription' && (
                                                            <button
                                                                onClick={() => handleDeleteOrderItem(item.id)}
                                                                className="absolute w-8 h-8 justify-center items-center border border-white/10 hover:bg-white/10 flex right-4 top-4 text-white-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-white-600 text-[9px]"
                                                                title={current.orders.deleteItem}
                                                            >
                                                                <Icon icon="pixelarticons:close" className="text-xs" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {order.order_type !== 'subscription' && (
                                                    <button
                                                        onClick={() => handleAddToOrder()}
                                                        className="mt-1  w-8 h-8 self-end justify-center items-center flex items-center gap-1 text-blue-400 hover:text-blue-300 text-[9px] cursor-pointer bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                                    >
                                                        <Icon icon="pixelarticons:plus" className="text-xs" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {order.order_type !== 'subscription' && order.address && (
                                            <div className="flex flex-col gap-1.5 border-l border-white/5 pl-4">
                                                <span className="text-white/60 text-xs flex items-center gap-1">
                                                    <Icon icon="pixelarticons:book-open" className="text-xs" />
                                                    {current.orders.shippingAddress}
                                                </span>
                                                <div className="text-[10px] text-white/40 flex flex-col gap-0.5 pl-4">
                                                    <div>{order.address.state} {order.address.city}</div>
                                                    <div className="text-white/60">{order.address.detail_address}</div>
                                                    <div className="text-white/30">{order.address.phone}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Order Actions */}
                                    {order.status === 'pending_payment' && (
                                        <div className="flex justify-end gap-2 border-t border-white/5 pt-3 mt-1">
                                            <button
                                                onClick={() => handleCancelOrder(order.id)}
                                                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 text-[10px] border border-red-500/30 cursor-pointer transition-colors"
                                            >
                                                {current.orders.cancelOrder}
                                            </button>
                                            <button
                                                onClick={() => setPayModalConfig({ isOpen: true, orderId: order.id, totalPrice: order.total_price })}
                                                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-black text-[10px] font-bold cursor-pointer transition-colors"
                                            >
                                                {current.orders.payNow}
                                            </button>
                                        </div>
                                    )}

                                    {order.status === 'cancelled' && (
                                        <div className="flex justify-end gap-2 border-t border-white/5 pt-3 mt-1">
                                            <button
                                                onClick={() => handleDeleteOrder(order.id)}
                                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                                            >
                                                <Icon icon="pixelarticons:trash" />
                                                {current.orders.deleteOrder}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {hasMore && (
                                <button
                                    onClick={() => fetchOrders(page + 1, true)}
                                    disabled={loadingMore}
                                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/40 text-xs border border-white/10 text-center mt-2 cursor-pointer transition-colors flex items-center justify-center gap-1"
                                >
                                    {loadingMore && <Icon icon="pixelarticons:reload" className="animate-spin" />}
                                    {current.orders.loadMore}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
