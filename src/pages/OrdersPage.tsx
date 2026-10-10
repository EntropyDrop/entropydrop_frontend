import { useAuthSession } from '../hooks/useAuthSession'
import { useLatestRequest } from '../hooks/useLatestRequest'
import { useOrderPayment } from '../hooks/useOrderPayment'
import { OrderKitDetails } from './figure/print/KitSpecificationsDetails'
import type { OrderStickerRecord } from './figure/print/orderSticker'
import type { KitSpecificationRecord } from './figure/print/kitSpecifications'
import { groupOrderItems } from './figure/print/orderItems'
import { FIGURE_MODELS, getFigureModelName } from './figure/print/figureModels'
import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { lazy, Suspense, useCallback, useState, useEffect } from 'react'
import { FigureOrderStatus } from '../components/FigureOrderStatus';
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { countries } from '../constants/countries'
import { Skin2DImg } from '../components/Skin2DImg';
import { ConfirmModal } from '../components/ConfirmModal';
import { apiFetch, apiResponseJson } from '../utils/api';
import { Skin3DModal } from '../components/Skin3DModal';
import { formatDate } from '../utils/date';

const FigureOrderPreviewModal = lazy(() => import('./figure/print/FigureOrderPreviewModal').then(module => ({ default: module.FigureOrderPreviewModal })))

interface OrdersPageProps {
    current: LangData
}

interface OrderItem extends KitSpecificationRecord, OrderStickerRecord {
    id: string;
    order_id: string;
    skin_url?: string;
    refer_log_id?: string | null;
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
    goods_status?: string;
    figure_review_status?: string;
    figure_review_reason?: string;
    refund_status?: string;
    tracking_number?: string;
    items?: OrderItem[];
    address?: {
        recipient_name?: string;
        country: string;
        state: string;
        city: string;
        detail_address: string;
        phone: string;
        zip_code?: string;
    }
}

export function OrdersPage({ current }: OrdersPageProps) {
    const authSession = useAuthSession();
    const [searchParams] = useSearchParams();
    const linkedOrder = searchParams.get("order");
    const ordersRequests = useLatestRequest();
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

    const [skin3DModalConfig, setSkin3DModalConfig] = useState<{
        isOpen: boolean;
        textureUrl: string | null;
        modelType?: string;
    }>({
        isOpen: false,
        textureUrl: null
    });

    const closePreview = useCallback(() => setSkin3DModalConfig({ isOpen: false, textureUrl: null }), []);
    const figurePreview = FIGURE_MODELS.some(model => model.orderModelType === skin3DModalConfig.modelType);

    const fetchOrders = useCallback(async (pageNum = 1, append = false) => {
        const token = authSession;
        if (!token) {
            navigate('/skin/');
            return;
        }

        const ticket = ordersRequests.begin();
        try {
            setError(null);
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            const response = await apiFetch(linkedOrder ? `/api/orders/${encodeURIComponent(linkedOrder)}` : `/api/orders?page=${pageNum}&page_size=10`, { signal: ticket.signal });
            if (response.ok) {
                const result = await apiResponseJson(response);
                if (!ticket.isCurrent()) return;
                const data = linkedOrder ? { items: [result], total_pages: 1 } : result;
                if (append) {
                    setOrders(prev => [...prev, ...data.items]);
                } else {
                    setOrders(data.items);
                }
                setHasMore(pageNum < data.total_pages);
                setPage(pageNum);
            } else {
                if (ticket.isCurrent()) setError('Failed to fetch orders');
            }
        } catch {
            if (ticket.isCurrent()) setError('Network error');
        } finally {
            if (ticket.isCurrent()) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [authSession, linkedOrder, navigate, ordersRequests]);

    const { pay, processingOrderId } = useOrderPayment({
        authSession, current,
        onSuccess: () => {
            setModalConfig({ isOpen: true, title: current.orders.tip, message: current.modal.paySuccess, type: 'success' });
            void fetchOrders();
        },
        onError: message => setModalConfig({ isOpen: true, title: current.modal.payOrder, message, type: 'error' }),
    });

    useEffect(() => {
        closePreview();
        setOrders([]);
        setPage(1);
        if (authSession) fetchOrders();
        return () => ordersRequests.cancel();
    }, [authSession, linkedOrder, closePreview, fetchOrders, ordersRequests]);

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
        } catch {
            setModalConfig({ isOpen: true, title: current.orders.networkTitle, message: current.orders.networkError, type: 'error' });
        }
    };

    const handleDeleteOrderItem = (itemId: string, quantity: number) => {
        setModalConfig({
            isOpen: true,
            title: quantity > 1 ? current.orders.removeOne : current.orders.deleteItem,
            message: quantity > 1 ? current.orders.confirmRemoveOne : current.orders.confirmDelete,
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
        } catch {
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
        } catch {
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
            'cancelled': current.orders.statuses.cancelled,
            'refund_pending': current.figureManagement.statuses.refund_pending,
            'refunded': current.figureManagement.statuses.refunded
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
        <PageContainer
            maxWidth="max-w-4xl"
            gap="gap-4"
            overflow="overflow-hidden"
            animate="animate-in fade-in zoom-in duration-300"
            className={current.fontClass}
        >
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
            {!figurePreview && <Skin3DModal
                isOpen={skin3DModalConfig.isOpen}
                onClose={closePreview}
                textureUrl={skin3DModalConfig.textureUrl}
                current={current}
            />}
            {figurePreview && skin3DModalConfig.isOpen && skin3DModalConfig.textureUrl && <Suspense fallback={null}><FigureOrderPreviewModal key={skin3DModalConfig.textureUrl} textureUrl={skin3DModalConfig.textureUrl} current={current} onClose={closePreview} /></Suspense>}

                {/* Header */}
                <div className="flex justify-between items-end border-b border-white/10 pb-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <h2 className={`text-white text-xl sm:text-2xl m-0 ${current.fontClass}`}>
                            {current.user.orders}
                        </h2>
                        {linkedOrder && <Link to="/skin/orders" className="text-xs text-[#a6df7a] underline">{current.figureManagement.filters.all}</Link>}
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

                                    {order.order_type === "print" && <FigureOrderStatus current={current} order={order} />}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-white/60 text-xs flex items-center gap-1">
                                                <Icon icon="pixelarticons:box" className="text-xs" />
                                                {order.order_type === 'subscription' ? current.orders.subscription : `${current.orders.orderItems} (${order.items?.length ?? 0})`}
                                            </span>
                                            <div className="flex flex-col gap-1.5 pl-4 mt-1">
                                                {groupOrderItems(order.items ?? []).map(({ item, ids, quantity, subtotal }) => (
                                                    <div key={item.id} className="text-[10px] text-white/40 bg-white/5 p-2 relative group">
                                                        <div className="flex gap-2 items-center">
                                                        {item.skin_url && (
                                                            <button type="button" aria-label={current.orders.preview}
                                                                onClick={() => setSkin3DModalConfig({ isOpen: true, textureUrl: item.skin_url!, modelType: item.model_type })}
                                                                className="cursor-pointer shrink-0 w-14 h-14"
                                                            >
                                                                <Skin2DImg src={item.skin_url} className="w-14 h-14 object-cover bg-black/40 border border-white/5 shrink-0" />
                                                            </button>
                                                        )}
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            {order.order_type === 'subscription' ? (
                                                                <div>{current.orders.subscriptions[item.model_type as keyof typeof current.orders.subscriptions] || item.model_type}</div>
                                                            ) : (
                                                                <><div className="text-white/80">{item.kit_specifications_snapshot?.product_name || item.kit_specifications_current?.product_name || getFigureModelName(item.model_type)}</div><div>{current.orders.quantity}: {quantity} × ${item.price.toFixed(2)}</div><div>{current.orders.subtotal}: ${subtotal.toFixed(2)}</div></>
                                                            )}
                                                        </div>
                                                        {order.status === 'pending_payment' && order.order_type !== 'subscription' && (
                                                            <button
                                                                disabled={processingOrderId === order.id}
                                                                onClick={() => handleDeleteOrderItem(ids[ids.length - 1], quantity)}
                                                                className="w-8 h-8 shrink-0 justify-center items-center border border-white/10 hover:bg-white/10 flex text-white/60 cursor-pointer text-[9px] disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title={quantity > 1 ? current.orders.removeOne : current.orders.deleteItem}
                                                                aria-label={quantity > 1 ? current.orders.removeOne : current.orders.deleteItem}
                                                            >
                                                                <Icon icon={quantity > 1 ? "pixelarticons:minus" : "pixelarticons:close"} className="text-xs" />
                                                            </button>
                                                        )}
                                                        </div>
                                                        {order.order_type !== 'subscription' && <OrderKitDetails item={item} current={current} />}
                                                    </div>
                                                ))}
                                                {order.order_type !== 'subscription' && (
                                                    <button
                                                        onClick={() => navigate('/figure/3dprint')}
                                                        aria-label={current.figurePrint.commissionOrder.title}
                                                        title={current.figurePrint.commissionOrder.title}
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
                                                <div className="text-[10px] text-white/40 flex flex-col gap-0.5 pl-4 break-words">
                                                    {order.address.recipient_name && <div className="break-words text-white/80">{order.address.recipient_name}</div>}
                                                    <div>{countries.find(country => country.code === order.address?.country)?.[current.lang === 'zh-hans' ? 'zhName' : 'name'] || order.address.country}</div>
                                                    <div>{order.address.state} {order.address.city}</div>
                                                    <div className="text-white/60">{order.address.detail_address}</div>
                                                    {order.address.zip_code && <div>{order.address.zip_code}</div>}
                                                    <div className="text-white/30">{order.address.phone}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Order Actions */}
                                    {order.status === 'pending_payment' && (
                                        <div className="flex justify-end gap-2 border-t border-white/5 pt-3 mt-1">
                                            <button
                                                disabled={processingOrderId === order.id}
                                                onClick={() => handleCancelOrder(order.id)}
                                                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 text-[10px] border border-red-500/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {current.orders.cancelOrder}
                                            </button>
                                            <button
                                                onClick={() => void pay(order.id)}
                                                disabled={processingOrderId !== null}
                                                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-black text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                            >
                                                {processingOrderId === order.id && <Icon icon="pixelarticons:reload" className="animate-spin" />}
                                                {processingOrderId === order.id ? current.credits.waitingPayment : current.orders.payNow}
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
        </PageContainer>
    );
}
