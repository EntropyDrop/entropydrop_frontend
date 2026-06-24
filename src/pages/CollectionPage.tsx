import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { Skin2DImg } from '../components/Skin2DImg'
import { AnimatePresence } from 'framer-motion'
import { MCModal } from '../components/MCModal'
import { showError } from '../utils/alert'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder'
import { apiFetch } from '../utils/api'


interface Collection {
    id: number | string
    name: string
    is_public: boolean
    item_count: number
    original_creation: boolean
    user_id?: number
    previews?: any[]
}

interface CollectionItem {
    id: number | string
    collection_id: number | string
    name: string
    type: string
    log_id?: string
    data: {
        url?: string
        preview?: string
        result?: string
        [key: string]: any
    }
}

interface CollectionPageProps {
    current: LangData
}

export function CollectionPage({ current }: CollectionPageProps) {
    const navigate = useNavigate()
    const { userId, collectionId: pathCollectionId } = useParams()
    const [myUserId, setMyUserId] = useState<string | null>(null)
    const [searchParams] = useSearchParams()
    const sharedId = searchParams.get('id')
    const [publicCollections, setPublicCollections] = useState<Collection[]>([])
    const [privateCollections, setPrivateCollections] = useState<Collection[]>([])
    const allCustom = [...publicCollections, ...privateCollections];
    const [originalCollections, setOriginalCollections] = useState<Collection[]>([])
    const [currentCollection, setCurrentCollection] = useState<Collection | null>(null)
    const [items, setItems] = useState<CollectionItem[]>([])
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } })
    const [newCollectionName, setNewCollectionName] = useState('')
    const [isNewCollectionPublic, setIsNewCollectionPublic] = useState(true)
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
    const [itemToMove, setItemToMove] = useState<CollectionItem | null>(null)
    const [isPro, setIsPro] = useState(false)

    // Rename state
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
    const [collectionToRename, setCollectionToRename] = useState<Collection | null>(null)
    const [renameCollectionName, setRenameCollectionName] = useState('')

    // Pagination for Collections
    const [publicColPage, setPublicColPage] = useState(1)
    const [privateColPage, setPrivateColPage] = useState(1)
    const [publicColTotalPages, setPublicColTotalPages] = useState(0)
    const [privateColTotalPages, setPrivateColTotalPages] = useState(0)

    // Pagination for Items
    const [itemPage, setItemPage] = useState(1)
    const [itemTotalPages, setItemTotalPages] = useState(0)
    const [totalItems, setTotalItems] = useState(0)

    // Filters
    const [filterName, setFilterName] = useState('')
    const [filterMode, setFilterMode] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [modeInput, setModeInput] = useState('')

    const fetchCollections = async (page: number = 1, targetUserId?: string, isPublic?: boolean) => {
        const isMe = !targetUserId || targetUserId === myUserId;
        // If we don't specify isPublic, we might be fetching for someone else or initial load
        // But for "independent" UI, we should specify.

        setIsLoading(true)
        try {
            let url = isMe ? `/api/collections?page=${page}&page_size=12` : `/api/users/${targetUserId}/collections?page=${page}&page_size=12`;
            if (isPublic !== undefined) {
                url += `&is_public=${isPublic}`
            }
            const response = await apiFetch(url);
            if (response.ok) {
                const data = await response.json()
                if (isPublic === true) {
                    setPublicCollections(data.items)
                    setPublicColTotalPages(data.total_pages)
                    setPublicColPage(data.page)
                } else if (isPublic === false) {
                    setPrivateCollections(data.items)
                    setPrivateColTotalPages(data.total_pages)
                    setPrivateColPage(data.page)
                } else {
                    // Fallback: split them if we didn't specify filter
                    setPublicCollections(data.items.filter((c: any) => c.is_public))
                    setPrivateCollections(data.items.filter((c: any) => !c.is_public))
                    // This fallback isn't ideal for total pages, but isMe fetch usually specifies isPublic now.
                }

                if (data.original_items) {
                    setOriginalCollections(data.original_items || [])
                }
            }
        } catch (e) {
            console.error('Failed to fetch collections', e)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchUserStatus = async () => {
        try {
            const res = await apiFetch('/api/users/me')
            if (res.ok) {
                const data = await res.json()
                setIsPro(data.is_pro)
                setMyUserId(data.id)
            }
        } catch (e) {
            console.error('Failed to fetch user status', e)
        }
    }

    const fetchItems = async (collectionId: number | string, page: number = 1, targetUserId?: string) => {
        setIsLoading(true)

        try {
            const allCustom = [...publicCollections, ...privateCollections];
            const col = allCustom.find(c => c.id === collectionId) || originalCollections.find(c => c.id === collectionId) || currentCollection;
            const uid = targetUserId || col?.user_id || userId;
            let url = `/api/collections/items?collection_id=${collectionId}&user_id=${uid}&page=${page}&page_size=24`
            if (filterName) url += `&name=${encodeURIComponent(filterName)}`
            if (filterMode) url += `&mode=${filterMode}`
            const response = await apiFetch(url)
            if (response.ok) {
                const data = await response.json()
                setItems(data.items)
                setItemTotalPages(data.total_pages)
                setItemPage(data.page)
                setTotalItems(data.total)
            }
        } catch (e) {
            console.error('Failed to fetch items', e)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (localStorage.getItem('token')) {
            fetchUserStatus()
        }
    }, [])

    useEffect(() => {
        if (!localStorage.getItem('token')) return;

        // 1. Handle legacy ?id= shared links
        if (sharedId) {
            // Redirect to the new format if we can, but we don't know the userId.
            // For now, let it handle via the sharedId effect below or just redirect to myUserId if it's mine?
            // Actually, let's just let the sharedId effect run as is for compatibility, 
            // but it would be better to redirect if we knew the owner.
        }

        // 2. Handle automatic redirect to /skin/collection/{myUserId}
        if (!userId && myUserId) {
            navigate(`/skin/collection/${myUserId}`, { replace: true });
            return;
        }

        // 3. Handle data fetching based on params
        if (userId) {
            if (pathCollectionId) {
                // If we are in a collection but currentCollection is not set or different
                if (!currentCollection || String(currentCollection.id) !== String(pathCollectionId)) {
                    const allCustom = [...publicCollections, ...privateCollections];
                    // Try to find it in loaded lists first
                    const found = allCustom.find(c => String(c.id) === String(pathCollectionId)) ||
                        originalCollections.find(c => String(c.id) === String(pathCollectionId));

                    if (found) {
                        setCurrentCollection(found);
                    } else {
                        // If not found (e.g. direct link), we might need to fetch its info or just set a placeholder
                        // The items fetch will use the userId from the URL anyway
                        setCurrentCollection({ id: pathCollectionId, name: '...', is_public: true, item_count: 0 } as any);
                    }
                }
                fetchItems(pathCollectionId, itemPage, userId);
            } else {
                // List view
                if (currentCollection) setCurrentCollection(null);
                if (userId === myUserId) {
                    fetchCollections(publicColPage, userId, true);
                    fetchCollections(privateColPage, userId, false);
                } else {
                    fetchCollections(publicColPage, userId, true);
                }
            }
        }
    }, [userId, pathCollectionId, myUserId, publicColPage, privateColPage, itemPage, filterName, filterMode]);

    useEffect(() => {
        if (sharedId && localStorage.getItem('token')) {
            setCurrentCollection({ id: sharedId, name: current.collection.publicCollection, is_public: true, item_count: 0 } as any);
            fetchItems(sharedId, 1);
        }
    }, [sharedId]);

    const renderPreviewStack = (previews?: any[]) => {
        if (!previews || previews.length === 0) return null;
        return (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {previews.slice(0, 3).map((item: any, idx: number) => (
                    <Skin2DImg
                        key={idx}
                        src={item.data.result || item.data.url}
                        className="absolute w-[85%] h-[85%] object-contain drop-shadow-2xl transition-transform group-hover:scale-105"
                        style={{
                            transform: `translate(${idx * 40 - (previews.length - 1) * 20}px, ${idx * 10 - (previews.length - 1) * 6}px)`,
                            zIndex: 10 - idx,
                            opacity: 1 - idx * 0.25,
                        }}
                    />
                ))}
            </div>
        );
    };

    const handleUploadItem = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentCollection) return;

        if (file.size > 512 * 1024) {
            showError(current.collection.fileTooLarge);
            return;
        }

        const processFile = async (): Promise<Blob> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    if (img.width === 64 && img.height === 32) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 64;
                        canvas.height = 64;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = 64;
                            tempCanvas.height = 32;
                            const tempCtx = tempCanvas.getContext('2d');
                            if (tempCtx) {
                                tempCtx.drawImage(img, 0, 0);
                                const armData = tempCtx.getImageData(40, 16, 16, 16);
                                ctx.putImageData(armData, 32, 48);
                                const legData = tempCtx.getImageData(0, 16, 16, 16);
                                ctx.putImageData(legData, 16, 48);
                            }
                            canvas.toBlob((blob) => {
                                if (blob) resolve(blob);
                                else resolve(file);
                            }, 'image/png');
                            return;
                        }
                    }
                    resolve(file);
                };
                img.onerror = () => resolve(file);
                img.src = URL.createObjectURL(file);
            });
        };

        const formData = new FormData();
        const finalBlob = await processFile();
        formData.append('file', finalBlob, file.name);

        try {
            let uploadColId = currentCollection.id;
            const isCustom = !['creations_public', 'creations_private'].includes(String(currentCollection.id));
            if (isCustom) {
                uploadColId = currentCollection.is_public ? 'creations_public' : 'creations_private';
            }

            const response = await apiFetch(`/api/collections/${uploadColId}/upload`, {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                if (isCustom) {
                    const data = await response.json();
                    const linkResponse = await apiFetch('/api/collections/items', {
                        method: 'POST',
                        body: JSON.stringify({
                            collection_id: String(currentCollection.id),
                            name: data.name || file.name.replace(/\.[^/.]+$/, ""),
                            type: 'human_upload',
                            log_id: data.log_id || data.id,
                            data: data.data || {}
                        })
                    });
                    if (linkResponse.ok) {
                        fetchItems(currentCollection.id, itemPage);
                    } else {
                        const errorData = await linkResponse.json().catch(() => ({}));
                        showError(errorData.detail || current.collection.uploadFailed);
                    }
                } else {
                    fetchItems(currentCollection.id, itemPage);
                }
            } else {
                showError(current.collection.uploadFailed);
            }
        } catch (e) {
            console.error('Failed to upload item', e);
        } finally {
            // Reset file input value so same file can be uploaded again if needed
            e.target.value = '';
        }
    };

    const handleMoveItem = async (targetCollectionId: string | number) => {
        if (!itemToMove) return;
        try {
            const response = await apiFetch(`/api/collections/items/${itemToMove.id}/move`, {
                method: 'POST',
                body: JSON.stringify({ target_collection_id: String(targetCollectionId) })
            });
            if (response.ok) {
                setIsMoveModalOpen(false);
                setItemToMove(null);
                if (currentCollection) {
                    const pageToFetch = (items.length - 1 === 0 && itemPage > 1) ? itemPage - 1 : itemPage;
                    fetchItems(currentCollection.id, pageToFetch);
                }
            } else {
                const errorData = await response.json();
                showError(errorData.detail || current.collection.moveFailed);
            }
        } catch (e) {

            console.error('Failed to move item', e);
        }
    };

    const handleRenameCollection = async () => {
        if (!collectionToRename || !renameCollectionName.trim()) return

        try {
            const response = await apiFetch(`/api/collections/${collectionToRename.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: renameCollectionName
                })
            })
            if (response.ok) {
                setIsRenameModalOpen(false)
                setCollectionToRename(null)
                setRenameCollectionName('')
                fetchCollections(publicColPage, myUserId || undefined, true)
                fetchCollections(privateColPage, myUserId || undefined, false)
            } else {
                showError(current.collection.renameFailed)
            }
        } catch (e) {

            console.error('Failed to rename collection', e)
        }
    }

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return

        try {
            const response = await apiFetch('/api/collections', {
                method: 'POST',
                body: JSON.stringify({
                    name: newCollectionName,
                    is_public: isNewCollectionPublic
                })
            })
            if (response.ok) {
                setIsCreateModalOpen(false)
                setNewCollectionName('')
                fetchCollections(1, myUserId || undefined, true)
                fetchCollections(1, myUserId || undefined, false)
            }
        } catch (e) {
            console.error('Failed to create collection', e)
        }
    }

    const handleDeleteCollection = async (e: React.MouseEvent, id: number | string) => {
        e.stopPropagation()
        const msg = current.collection.confirmDelete
        setConfirmModal({
            isOpen: true,
            title: current.collection.confirmDeleteTitle,
            message: msg,
            onConfirm: async () => {
                try {
                    const response = await apiFetch(`/api/collections/${id}`, {
                        method: 'DELETE'
                    })
                    if (response.ok) {
                        fetchCollections(publicColPage, myUserId || undefined, true)
                        fetchCollections(privateColPage, myUserId || undefined, false)
                    }
                } catch (e) {
                    console.error('Failed to delete collection', e)
                }
            }
        })
    }

    const handleDeleteItem = async (e: React.MouseEvent, id: any) => {
        e.stopPropagation()

        const pageToFetch = (items.length - 1 === 0 && itemPage > 1) ? itemPage - 1 : itemPage;

        if (currentCollection?.id === 'liked') {
            const msg = current.collection.confirmRemoveLike
            setConfirmModal({
                isOpen: true,
                title: current.collection.confirmRemove,
                message: msg,
                onConfirm: async () => {
                    try {
                        const response = await apiFetch(`/api/like/${id}`, {
                            method: 'POST'
                        })
                        if (response.ok) {
                            fetchItems('liked', pageToFetch)
                        }
                    } catch (e) {
                        console.error('Failed to delete liked item', e)
                    }
                }
            })
            return
        }

        if (currentCollection?.id === 'creations_public' || currentCollection?.id === 'creations_private') {
            const warnMsg = current.collection.confirmPermanentDelete
            setConfirmModal({
                isOpen: true,
                title: current.collection.confirmDeleteTitle,
                message: warnMsg,
                onConfirm: async () => {
                    try {
                        const response = await apiFetch(`/api/logs/${id}`, {
                            method: 'DELETE'
                        })
                        if (response.ok) {
                            if (currentCollection) {
                                fetchItems(currentCollection.id, pageToFetch)
                            }
                        }
                    } catch (e) {
                        console.error('Failed to delete creation', e)
                    }
                }
            })
            return
        }

        // Normal Collection Item deletion
        const msg = current.collection.confirmRemoveShortcut
        setConfirmModal({
            isOpen: true,
            title: current.collection.confirmRemove,
            message: msg,
            onConfirm: async () => {
                try {
                    const response = await apiFetch(`/api/collections/items/${id}`, {
                        method: 'DELETE'
                    })
                    if (response.ok) {
                        if (currentCollection) {
                            fetchItems(currentCollection.id, pageToFetch)
                        }
                    }
                } catch (e) {
                    console.error('Failed to delete item', e)
                }
            }
        })
    }

    const enterCollection = (col: Collection) => {
        const uid = userId || myUserId;
        if (uid) {
            setFilterName('');
            setFilterMode('');
            setSearchInput('');
            setModeInput('');
            setItemPage(1);
            navigate(`/skin/collection/${uid}/${col.id}`);
        }
    }

    if (!localStorage.getItem('token')) {
        return (
            <PageContainer className="items-center justify-center">
                    <Icon icon="pixelarticons:lock" className="text-6xl opacity-30" />
                    <div className="text-center flex flex-col gap-1">
                        <h2 className={`text-xl font-bold ${current.fontClass}`}>
                            {current.common.authRequired}
                        </h2>
                        <p className={`text-white/60 text-xs ${current.fontClass}`}>
                            {current.collection.loginPrompt}
                        </p>
                    </div>
            </PageContainer>
        )
    }

    return (
        <PageContainer className="relative">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/10 pb-6 shrink-0 w-full">
                    <div className="w-full md:w-auto">
                        <div className="flex items-center gap-2 mb-1 w-full">
                            {currentCollection && (
                                <button
                                    onClick={() => {
                                        const uid = (userId || myUserId)!;
                                        setFilterName('');
                                        setFilterMode('');
                                        setSearchInput('');
                                        setModeInput('');
                                        setItemPage(1);
                                        navigate(`/skin/collection/${uid}`);
                                        if (uid === myUserId) {
                                            fetchCollections(publicColPage, uid, true)
                                            fetchCollections(privateColPage, uid, false)
                                        } else {
                                            fetchCollections(publicColPage, uid, true)
                                        }
                                    }}
                                    className="p-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer shrink-0"
                                >
                                    <Icon icon="pixelarticons:arrow-left" className="text-xl" />
                                </button>
                            )}
                            <h2 className={`text-white text-2xl sm:text-3xl m-0 truncate ${current.fontClass}`}>
                                {currentCollection ? currentCollection.name : current.collection.title}
                            </h2>
                        </div>
                        <p className={`text-white/40 text-sm ${current.fontClass}`}>
                            {currentCollection
                                ? `${totalItems}`
                                : current.collection.subtitle
                            }
                        </p>
                    </div>

                    <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
                        {!currentCollection && (
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className={`px-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white border-2 border-black cursor-pointer text-xs flex items-center justify-center gap-2 transition-all active:translate-y-0.5 w-full md:w-auto ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:plus" />
                                {current.collection.btnNew}
                            </button>
                        )}

                        {currentCollection && (
                            <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
                                {/* Header Filter Bar */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                    <div className="relative w-full sm:w-72">
                                        <Icon icon="pixelarticons:search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs" />
                                        <input
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (setFilterName(searchInput), setFilterMode(modeInput), setItemPage(1))}
                                            placeholder={current.collection.filterName}
                                            className="w-full bg-black/40 border border-white/10 pl-8 pr-4 py-2 text-white text-xs outline-none focus:border-[#3c8527] transition-colors font-pixel-hans"
                                        />
                                    </div>
                                    <select
                                        value={modeInput}
                                        onChange={(e) => setModeInput(e.target.value)}
                                        className="bg-black/40 border border-white/10 px-3 py-2 text-white text-xs outline-none focus:border-[#3c8527] transition-colors cursor-pointer font-pixel-hans w-full sm:w-auto min-w-0 sm:min-w-[120px]"
                                    >
                                        <option value="">{current.collection.allTypes}</option>
                                        <option value="aigc_text_to_skin">{current.collection.modeTextToSkin}</option>
                                        <option value="aigc_image_to_skin">{current.collection.modeImageToSkin}</option>
                                        <option value="aigc_image_edit_to_skin">{current.collection.modeImageEditToSkin}</option>
                                        <option value="human_edit">{current.collection.modeHumanEdit}</option>
                                        <option value="human_upload">{current.collection.modeHumanUpload}</option>
                                    </select>
                                    <button
                                        onClick={() => {
                                            setFilterName(searchInput);
                                            setFilterMode(modeInput);
                                            setItemPage(1);
                                        }}
                                        className={`px-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white text-xs border border-black cursor-pointer transition-all active:translate-y-0.5 w-full sm:w-auto ${current.fontClass}`}
                                    >
                                        {current.collection.search}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Grid */}
                <div className="flex-1 flex flex-col gap-8 overflow-y-auto custom-scrollbar pr-2">
                    {/* Collection List View */}
                    {!currentCollection && (
                        <>
                            {/* Default Collections Section */}
                            {originalCollections.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <span className={`text-white/20 text-[10px] uppercase tracking-widest font-bold ${current.fontClass}`}>
                                            {(current.collection as any).labelDefault}
                                        </span>
                                        <div className="h-px flex-1 bg-white/5" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                        {originalCollections.map((col) => {
                                            const isLiked = col.id === 'liked';
                                            const isPubCreations = col.id === 'creations_public';
                                            const isPrivCreations = col.id === 'creations_private';

                                            const localizedName = isLiked ? current.collection.myLikes
                                                : isPubCreations ? current.collection.creationsPublic
                                                    : isPrivCreations ? current.collection.creationsPrivate
                                                        : col.name;

                                            let icon = "pixelarticons:folder";
                                            let hoverBorder = "group-hover:border-green-500/30";
                                            let hoverBg = "group-hover:bg-green-500/5";
                                            let iconHoverColor = "group-hover:text-[#3c8527]";
                                            let countIcon = col.is_public ? "pixelarticons:bullseye" : "pixelarticons:lock";
                                            let countIconColor = "";

                                            if (isLiked) {
                                                icon = "pixelarticons:heart";
                                                hoverBorder = "group-hover:border-red-500/30";
                                                hoverBg = "group-hover:bg-red-500/5";
                                                iconHoverColor = "group-hover:text-red-500";
                                                countIcon = "pixelarticons:heart";
                                                countIconColor = "text-red-500";
                                            } else if (isPubCreations) {
                                                icon = "pixelarticons:image";
                                                hoverBorder = "group-hover:border-blue-500/30";
                                                hoverBg = "group-hover:bg-blue-500/5";
                                                iconHoverColor = "group-hover:text-blue-500";
                                                countIcon = "pixelarticons:bullseye";
                                                countIconColor = "text-blue-500";
                                            } else if (isPrivCreations) {
                                                icon = "pixelarticons:image-plus";
                                                hoverBorder = "group-hover:border-purple-500/30";
                                                hoverBg = "group-hover:bg-purple-500/5";
                                                iconHoverColor = "group-hover:text-purple-500";
                                                countIcon = "pixelarticons:lock";
                                                countIconColor = "text-purple-500";
                                            }

                                            return (
                                                <div
                                                    key={col.id}
                                                    onClick={() => enterCollection({ ...col, name: localizedName })}
                                                    className="group flex flex-col gap-3 cursor-pointer animate-in fade-in zoom-in duration-300"
                                                >
                                                    <div className={`aspect-square bg-white/5 border border-white/10 group-hover:bg-white/10 ${hoverBorder} transition-all flex items-center justify-center relative overflow-hidden`}>
                                                        <div className="flex flex-col items-center justify-center w-full h-full">
                                                            <div className="relative w-full h-full flex items-center justify-center">
                                                                {/* Background Icon */}
                                                                <Icon icon={icon} className={`text-6xl lg:text-7xl text-white/5 ${iconHoverColor} transition-colors z-0 absolute`} />

                                                                {/* Preview Stack */}
                                                                {renderPreviewStack(col.previews)}
                                                            </div>
                                                        </div>

                                                        {/* Item Count - Top Right of Card */}
                                                        <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-[10px] text-white/90 border border-white/10 rounded-sm flex items-center gap-1 z-20 backdrop-blur-sm">
                                                            <Icon icon={countIcon} className={countIconColor} />
                                                            {col.item_count}
                                                        </span>

                                                        <div className={`absolute inset-0 ${hoverBg} transition-colors pointer-events-none`} />
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 px-1 pb-2">
                                                        <span className={`text-white/80 text-[11px] sm:text-xs truncate ${current.fontClass}`}>{localizedName}</span>
                                                        <span className={`text-white/20 text-[9px] uppercase ${current.fontClass}`}>
                                                            {current.collection.typeCollection}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Custom Collections - Public */}
                            {publicCollections.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-white/20 text-[10px] uppercase tracking-widest font-bold ${current.fontClass}`}>
                                                {(current.collection as any).labelPublic}
                                            </span>
                                            {publicColTotalPages > 1 && (
                                                <div className="flex items-center gap-2 ml-2">
                                                    <button
                                                        disabled={isLoading || publicColPage === 1}
                                                        onClick={(e) => { e.stopPropagation(); setPublicColPage(p => Math.max(1, p - 1)); }}
                                                        className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer"
                                                    >
                                                        <Icon icon="pixelarticons:chevron-left" className="text-[10px]" />
                                                    </button>
                                                    <span className="text-white/40 text-[9px] min-w-[24px] text-center">{publicColPage} / {publicColTotalPages}</span>
                                                    <button
                                                        disabled={isLoading || publicColPage === publicColTotalPages}
                                                        onClick={(e) => { e.stopPropagation(); setPublicColPage(p => Math.min(publicColTotalPages, p + 1)); }}
                                                        className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer"
                                                    >
                                                        <Icon icon="pixelarticons:chevron-right" className="text-[10px]" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="h-px flex-1 bg-white/5" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                        {publicCollections.map((col) => (
                                            <div
                                                key={col.id}
                                                onClick={() => enterCollection(col)}
                                                className="group flex flex-col gap-3 cursor-pointer animate-in fade-in zoom-in duration-300"
                                            >
                                                <div className="aspect-square bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-green-500/30 transition-all flex items-center justify-center relative overflow-hidden">
                                                    <div className="flex flex-col items-center justify-center w-full h-full">
                                                        <div className="relative w-full h-full flex items-center justify-center">
                                                            {/* Background Icon */}
                                                            <Icon icon="pixelarticons:folder" className="text-6xl lg:text-7xl text-white/5 group-hover:text-[#3c8527] transition-colors z-0 absolute" />

                                                            {/* Preview Stack */}
                                                            {renderPreviewStack(col.previews)}
                                                        </div>
                                                    </div>

                                                    {/* Item Count - Top Right of Card */}
                                                    <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-[10px] text-white/90 border border-white/10 rounded-sm flex items-center gap-1 z-20 backdrop-blur-sm">
                                                        <Icon icon={col.is_public ? "pixelarticons:bullseye" : "pixelarticons:lock"} />
                                                        {col.item_count}
                                                    </span>

                                                    <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCollectionToRename(col);
                                                                setRenameCollectionName(col.name);
                                                                setIsRenameModalOpen(true);
                                                            }}
                                                            className="p-1 bg-blue-900/40 hover:bg-blue-600 text-white/60 hover:text-white border border-white/10"
                                                            title={current.collection.btnRename}
                                                        >
                                                            <Icon icon="pixelarticons:edit" className="text-xs" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteCollection(e, col.id)}
                                                            className="p-1 bg-red-900/40 hover:bg-red-600 text-white/60 hover:text-white border border-white/10"
                                                            title={current.collection.btnDelete}
                                                        >
                                                            <Icon icon="pixelarticons:trash" className="text-xs" />
                                                        </button>
                                                    </div>

                                                    <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/5 transition-colors pointer-events-none" />
                                                </div>
                                                <div className="flex flex-col gap-0.5 px-1 pb-2">
                                                    <span className={`text-white/80 text-[11px] sm:text-xs truncate ${current.fontClass}`}>{col.name}</span>
                                                    <span className={`text-white/20 text-[9px] uppercase ${current.fontClass}`}>
                                                        {current.collection.typeCollection}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Custom Collections - Private */}
                            {privateCollections.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-white/20 text-[10px] uppercase tracking-widest font-bold ${current.fontClass}`}>
                                                {(current.collection as any).labelPrivate}
                                            </span>
                                            {privateColTotalPages > 1 && (
                                                <div className="flex items-center gap-2 ml-2">
                                                    <button
                                                        disabled={isLoading || privateColPage === 1}
                                                        onClick={(e) => { e.stopPropagation(); setPrivateColPage(p => Math.max(1, p - 1)); }}
                                                        className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer"
                                                    >
                                                        <Icon icon="pixelarticons:chevron-left" className="text-[10px]" />
                                                    </button>
                                                    <span className="text-white/40 text-[9px] min-w-[24px] text-center">{privateColPage} / {privateColTotalPages}</span>
                                                    <button
                                                        disabled={isLoading || privateColPage === privateColTotalPages}
                                                        onClick={(e) => { e.stopPropagation(); setPrivateColPage(p => Math.min(privateColTotalPages, p + 1)); }}
                                                        className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer"
                                                    >
                                                        <Icon icon="pixelarticons:chevron-right" className="text-[10px]" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="h-px flex-1 bg-white/5" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                        {privateCollections.map((col) => (
                                            <div
                                                key={col.id}
                                                onClick={() => enterCollection(col)}
                                                className="group flex flex-col gap-3 cursor-pointer animate-in fade-in zoom-in duration-300"
                                            >
                                                <div className="aspect-square bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-green-500/30 transition-all flex items-center justify-center relative overflow-hidden">
                                                    <div className="flex flex-col items-center justify-center w-full h-full">
                                                        <div className="relative w-full h-full flex items-center justify-center">
                                                            {/* Background Icon */}
                                                            <Icon icon="pixelarticons:folder" className="text-6xl lg:text-7xl text-white/5 group-hover:text-[#3c8527] transition-colors z-0 absolute" />

                                                            {/* Preview Stack */}
                                                            {renderPreviewStack(col.previews)}
                                                        </div>
                                                    </div>

                                                    {/* Item Count - Top Right of Card */}
                                                    <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-[10px] text-white/90 border border-white/10 rounded-sm flex items-center gap-1 z-20 backdrop-blur-sm">
                                                        <Icon icon={col.is_public ? "pixelarticons:bullseye" : "pixelarticons:lock"} />
                                                        {col.item_count}
                                                    </span>

                                                    <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCollectionToRename(col);
                                                                setRenameCollectionName(col.name);
                                                                setIsRenameModalOpen(true);
                                                            }}
                                                            className="p-1 bg-blue-900/40 hover:bg-blue-600 text-white/60 hover:text-white border border-white/10"
                                                            title={current.collection.btnRename}
                                                        >
                                                            <Icon icon="pixelarticons:edit" className="text-xs" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteCollection(e, col.id)}
                                                            className="p-1 bg-red-900/40 hover:bg-red-600 text-white/60 hover:text-white border border-white/10"
                                                            title={current.collection.btnDelete}
                                                        >
                                                            <Icon icon="pixelarticons:trash" className="text-xs" />
                                                        </button>
                                                    </div>

                                                    <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/5 transition-colors pointer-events-none" />
                                                </div>
                                                <div className="flex flex-col gap-0.5 px-1 pb-2">
                                                    <span className={`text-white/80 text-[11px] sm:text-xs truncate ${current.fontClass}`}>{col.name}</span>
                                                    <span className={`text-white/20 text-[9px] uppercase ${current.fontClass}`}>
                                                        {current.collection.typeCollection}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Items inside Collection View */}
                    {currentCollection && (
                        <div className="flex flex-col gap-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                {items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="group flex flex-col gap-3 cursor-pointer animate-in fade-in zoom-in duration-300"
                                    >
                                        <div className="aspect-square bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-green-500/30 transition-all flex items-center justify-center relative overflow-hidden">
                                            <div onClick={() => setSelectedItem(item)} className="w-[80%] h-[80%] flex items-center justify-center cursor-pointer group-hover:scale-110 transition-transform">
                                                <Skin2DImg
                                                    src={item.data.result_render_2d || item.data.result || item.data.url || item.data.preview}
                                                    className="w-full h-full object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteItem(e, item.id)}
                                                className="absolute top-2 left-2 p-1 bg-red-900/40 hover:bg-red-600 text-white/60 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Icon icon="pixelarticons:close" className="text-xs" />
                                            </button>
                                            {currentCollection && !['liked', 'creations_public', 'creations_private'].includes(String(currentCollection.id)) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); }}
                                                    className="absolute top-2 right-2 p-1 bg-green-900/40 hover:bg-green-600 text-white/60 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title={current.collection.moveToCollection}
                                                >
                                                    <Icon icon="pixelarticons:folder-minus" className="text-xs" />
                                                </button>
                                            )}
                                            {currentCollection && String(currentCollection.id) === 'creations_public' && (
                                                <button
                                                    onClick={(e) => handleMakePrivate(e, item.log_id || item.id)}
                                                    className="absolute bottom-2 right-2 p-1 bg-yellow-900/40 hover:bg-yellow-600 text-white/60 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title={current.locale === 'zh' ? '转为私有 (Pro)' : 'Make Private (Pro)'}
                                                >
                                                    <Icon icon="pixelarticons:lock" className="text-xs" />
                                                </button>
                                            )}
                                            <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/5 transition-colors pointer-events-none" />
                                        </div>
                                        <div className="flex flex-col gap-0.5 px-1 pb-2">
                                            <span className={`text-white/80 text-[11px] sm:text-xs truncate ${current.fontClass}`}>{item.name}</span>
                                            <span className={`text-white/20 text-[9px] uppercase ${current.fontClass}`}>
                                                {(() => {
                                                    switch (item.type) {
                                                        case 'aigc_text_to_skin': return current.collection.modeTextToSkin;
                                                        case 'aigc_image_to_skin': return current.collection.modeImageToSkin;
                                                        case 'aigc_image_edit_to_skin': return current.collection.modeImageEditToSkin;
                                                        case 'human_edit': return current.collection.modeHumanEdit;
                                                        case 'human_upload': return current.collection.modeHumanUpload;
                                                        default: return item.type;
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Loading State */}

                    {/* Empty State */}
                    {currentCollection && !isLoading && items.length === 0 && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4 text-white/10">
                            <Icon icon="pixelarticons:folder-x" className="text-6xl" />
                            <span className={current.fontClass}>{current.collection.empty}</span>
                        </div>
                    )}
                </div>

                {/* Footer (Pagination & Actions) */}
                {currentCollection && (
                    <div className="mt-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 w-full">
                        <div className="flex items-center justify-center sm:justify-start gap-4 w-full sm:w-auto">
                            {currentCollection && itemTotalPages > 1 && (
                                <>
                                    <button
                                        disabled={isLoading || itemPage === 1}
                                        onClick={() => setItemPage(p => Math.max(1, p - 1))}
                                        className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                                    >
                                        <Icon icon={isLoading ? "pixelarticons:reload" : "pixelarticons:chevron-left"} className={isLoading ? "animate-spin" : ""} />
                                    </button>

                                    <div className={`text-white/40 text-xs ${current.fontClass}`}>
                                        {`${itemPage} / ${itemTotalPages}`}
                                    </div>

                                    <button
                                        disabled={isLoading || itemPage === itemTotalPages}
                                        onClick={() => setItemPage(p => Math.min(itemTotalPages, p + 1))}
                                        className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                                    >
                                        <Icon icon={isLoading ? "pixelarticons:reload" : "pixelarticons:chevron-right"} className={isLoading ? "animate-spin" : ""} />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Right Actions (Upload & Generate) */}
                        <div className="w-full sm:w-auto flex justify-center sm:justify-end">
                            <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
                                {currentCollection && (
                                    <button
                                        onClick={() => navigate('/skin/generate')}
                                        className={`px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 text-white border-2 border-white/10 cursor-pointer text-xs flex items-center justify-center gap-2 transition-all active:translate-y-0.5 w-full sm:w-auto ${current.fontClass}`}
                                    >
                                        <Icon icon="pixelarticons:zap" />
                                        {current.collection.btnGenerate}
                                    </button>
                                )}

                                {currentCollection && localStorage.getItem('token') && (
                                    ['creations_public', 'creations_private'].includes(String(currentCollection.id)) ||
                                    (!currentCollection.original_creation && myUserId && String(currentCollection.user_id) === String(myUserId))
                                ) && (
                                    <div className="flex items-center justify-center gap-3 w-full sm:w-auto">
                                        <input
                                            id="upload-item-input"
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleUploadItem}
                                        />
                                        {(!isPro && !currentCollection.is_public) ? (
                                            <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
                                                <div
                                                    onClick={() => navigate('/skin/pro')}
                                                    className="flex items-center justify-center gap-1.5 px-2 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 cursor-pointer hover:bg-yellow-400/20 transition-all animate-in fade-in slide-in-from-left-2 duration-300 w-full sm:w-auto"
                                                >
                                                    <Icon icon="pixelarticons:zap" className="text-xs" />
                                                    <span className={`text-[9px] lg:text-[10px] font-bold ${current.fontClass}`}>
                                                        {current.generate.privateTip}
                                                    </span>
                                                </div>
                                                <button
                                                    disabled
                                                    className={`px-4 py-2 bg-gray-700 text-white/40 border-2 border-black cursor-not-allowed text-xs flex items-center justify-center gap-2 transition-all w-full sm:w-auto ${current.fontClass}`}
                                                >
                                                    <Icon icon="pixelarticons:upload" />
                                                    {current.collection.upload}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    document.getElementById('upload-item-input')?.click();
                                                }}
                                                className={`px-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white border-2 border-black cursor-pointer text-xs flex items-center justify-center gap-2 transition-all active:translate-y-0.5 w-full sm:w-auto ${current.fontClass}`}
                                            >
                                                <Icon icon="pixelarticons:upload" />
                                                {current.collection.upload}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Create Collection Modal */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {current.collection.create}
                            </h3>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className={`text-white/40 text-[10px] uppercase font-bold tracking-wider ${current.fontClass}`}>
                                        {current.collection.name}
                                    </label>
                                    <input
                                        type="text"
                                        value={newCollectionName}
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        placeholder={current.collection.enterName}
                                        className="w-full bg-black/40 border border-white/10 p-3 text-white text-sm outline-none focus:border-[#3c8527] transition-colors"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className={`text-white/40 text-[10px] uppercase font-bold tracking-wider ${current.fontClass}`}>
                                        {current.collection.visibility}
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setIsNewCollectionPublic(true)}
                                            className={`p-2 border flex items-center justify-center gap-2 text-xs transition-all cursor-pointer ${isNewCollectionPublic
                                                ? 'bg-[#3c8527]/20 border-[#3c8527] text-white'
                                                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                                                } ${current.fontClass}`}
                                        >
                                            <Icon icon="pixelarticons:bullseye" className="text-base" />
                                            {current.collection.public}
                                        </button>
                                        <button
                                            onClick={() => setIsNewCollectionPublic(false)}
                                            className={`p-2 border flex items-center justify-center gap-2 text-xs transition-all cursor-pointer ${!isNewCollectionPublic
                                                ? 'bg-red-900/20 border-red-500/50 text-white'
                                                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                                                } ${current.fontClass}`}
                                        >
                                            <Icon icon="pixelarticons:lock" className="text-base" />
                                            {current.collection.private}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-2">
                                <button
                                    onClick={() => {
                                        setIsCreateModalOpen(false)
                                        setNewCollectionName('')
                                    }}
                                    className={`px-4 py-2 text-white/40 hover:text-white text-xs cursor-pointer transition-colors ${current.fontClass}`}
                                >
                                    {current.modal.cancel}
                                </button>
                                <button
                                    onClick={handleCreateCollection}
                                    disabled={!newCollectionName.trim()}
                                    className={`px-6 py-2 bg-[#3c8527] hover:bg-[#4ea632] disabled:opacity-30 disabled:hover:bg-[#3c8527] text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    {current.collection.btnCreate}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rename Collection Modal */}
                {isRenameModalOpen && collectionToRename && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {current.collection.rename}
                            </h3>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className={`text-white/40 text-[10px] uppercase font-bold tracking-wider ${current.fontClass}`}>
                                        {current.collection.name}
                                    </label>
                                    <input
                                        type="text"
                                        value={renameCollectionName}
                                        onChange={(e) => setRenameCollectionName(e.target.value)}
                                        placeholder={current.collection.enterNewName}
                                        className="w-full bg-black/40 border border-white/10 p-3 text-white text-sm outline-none focus:border-[#3c8527] transition-colors"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-2">
                                <button
                                    onClick={() => {
                                        setIsRenameModalOpen(false)
                                        setCollectionToRename(null)
                                    }}
                                    className={`px-4 py-2 text-white/40 hover:text-white text-xs cursor-pointer transition-colors ${current.fontClass}`}
                                >
                                    {current.modal.cancel}
                                </button>
                                <button
                                    onClick={handleRenameCollection}
                                    disabled={!renameCollectionName.trim()}
                                    className={`px-6 py-2 bg-[#3c8527] hover:bg-[#4ea632] disabled:opacity-30 disabled:hover:bg-[#3c8527] text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    {current.collection.btnRename}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {selectedItem && (
                        <MCModal
                            item={{
                                id: selectedItem.log_id || '',
                                prompt: selectedItem.name,
                                result: selectedItem.data.result || selectedItem.data.url || '',
                                is_public: currentCollection?.is_public ?? true
                            } as any}
                            current={current}
                            textureUrl={selectedItem.data.result || selectedItem.data.url || ''}
                            closeModal={() => setSelectedItem(null)}
                            onEdit={(texUrl, logId, isPublic) => navigate('/skin/edit', { state: { textureUrl: texUrl, passedLogId: logId, isPublic } })}

                            onAiEdit={(source: string, id: string, isPublic: boolean, sourceType?: 'source' | 'intermediate') => navigate('/skin/generate', { state: { sourceImage: source, sourceId: id, mode: 'aigc_image_edit_to_skin', isPublic, sourceType } })}
                        />
                    )}
                </AnimatePresence>

                {/* Move Item Modal */}
                {isMoveModalOpen && itemToMove && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                        <div className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {current.collection.moveToCollection}
                            </h3>

                            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {allCustom.filter(c => c.id !== currentCollection?.id)
                                    .map(col => (
                                        <button
                                            key={col.id}
                                            onClick={() => handleMoveItem(col.id)}
                                            className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm cursor-pointer transition-colors"
                                        >
                                            <Icon icon="pixelarticons:folder" className="text-lg text-white/40" />
                                            <span className="flex-1 text-left">{col.name}</span>
                                            <Icon icon={col.is_public ? "pixelarticons:bullseye" : "pixelarticons:lock"} className="text-white/20" />
                                        </button>
                                    ))}
                                {allCustom.filter(c => c.id !== currentCollection?.id).length === 0 && (
                                    <div className="text-white/40 text-xs text-center py-4">
                                        {current.collection.noCollectionAvailable}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 justify-end mt-2">
                                <button
                                    onClick={() => {
                                        setIsMoveModalOpen(false)
                                        setItemToMove(null)
                                    }}
                                    className={`px-4 py-2 text-white/40 hover:text-white text-xs cursor-pointer transition-colors ${current.fontClass}`}
                                >
                                    {current.modal.cancel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Prompt Modal */}
                {confirmModal.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                        <div className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {confirmModal.title}
                            </h3>

                            <p className={`text-white/60 text-sm ${current.fontClass}`}>
                                {confirmModal.message}
                            </p>

                            <div className="flex gap-3 justify-end mt-1">
                                <button
                                    onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                    className={`px-4 py-2 text-white/40 hover:text-white text-xs cursor-pointer transition-colors ${current.fontClass}`}
                                >
                                    {current.modal.cancel}
                                </button>
                                <button
                                    onClick={() => {
                                        confirmModal.onConfirm();
                                        setConfirmModal({ ...confirmModal, isOpen: false });
                                    }}
                                    className={`px-6 py-2 bg-red-800 hover:bg-red-600 text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    {current.modal.confirm}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && <LoadingPlaceholder current={current} />}
        </PageContainer>
    )
}
