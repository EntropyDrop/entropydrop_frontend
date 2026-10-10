import { useSkinLicensePolicy } from '../hooks/useSkinLicensePolicy'
import { useCollectionMoveTargets } from '../hooks/useCollectionMoveTargets'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAuthSession } from '../hooks/useAuthSession'
import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { useState, useEffect, useRef, useCallback, useEffectEvent } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { SEO } from '../components/SEO'
import { Skin2DImg } from '../components/Skin2DImg'
import { AnimatePresence } from 'framer-motion'
import { MCModal } from '../components/MCModal'
import { showError } from '../utils/alert'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder'
import { apiFetch, apiResponseJson } from '../utils/api'
import { CollectionUploadPicker } from '../components/CollectionUploadPicker'
import { SkinAvatarImage } from '../components/SkinAvatarImage'


interface Collection {
    id: number | string
    name: string
    is_public: boolean
    item_count: number
    original_creation: boolean
    user_id?: number | string
    previews?: Pick<CollectionItem, 'id' | 'data'>[]
}

interface CollectionItem {
    id: number | string
    collection_id: number | string
    name: string
    type: string
    log_id?: string
    data: {
        is_public?: boolean
        url?: string
        preview?: string
        result?: string
        result_render_2d?: string
    }
}

interface UploadedCollectionItem {
    id?: number | string
    log_id?: number | string
    name?: string
    result_url?: string
    data?: CollectionItem['data']
}

interface CollectionPageProps {
    current: LangData
}

interface CollectionOwner {
    id: string
    username: string | null
    picture: string | null
    skin_url: string | null
}

export function CollectionPage({ current }: CollectionPageProps) {
    const authSession = useAuthSession();
    const navigate = useNavigate()
    const { userId, collectionId: pathCollectionId } = useParams()
    const { user: currentUser } = useCurrentUser()
    const myUserId = currentUser ? String(currentUser.id) : null
    const isOwnCollectionPage = Boolean(myUserId && (!userId || userId === myUserId))
    const isOtherCollectionPage = Boolean(userId && userId !== myUserId)
    const [ownerSnapshot, setOwnerSnapshot] = useState<{
        session: string; userId: string; profile: CollectionOwner
    } | null>(null)
    const collectionOwner = ownerSnapshot?.session === authSession && ownerSnapshot?.userId === userId
        ? ownerSnapshot.profile : null
    const ownerName = collectionOwner?.username?.trim() || userId || ''
    const pageTitle = isOtherCollectionPage
        ? current.collection.ownerTitle.replace('{name}', () => ownerName)
        : current.collection.title
    const pageSubtitle = isOtherCollectionPage ? current.collection.ownerSubtitle : current.collection.subtitle
    const publicCreationsName = isOtherCollectionPage ? current.collection.ownerCreations : current.collection.creationsPublic
    const isPro = currentUser?.is_pro === true
    const [searchParams] = useSearchParams()
    const sharedId = searchParams.get('id')
    const [publicCollections, setPublicCollections] = useState<Collection[]>([])
    const [privateCollections, setPrivateCollections] = useState<Collection[]>([])
    const [originalCollections, setOriginalCollections] = useState<Collection[]>([])
    const [currentCollection, setCurrentCollection] = useState<Collection | null>(null)
    const canManageCurrentCollection = Boolean(currentCollection && authSession && isOwnCollectionPage &&
        String(currentCollection.id) === String(pathCollectionId || sharedId) &&
        String(currentCollection.user_id) === myUserId)
    const canUploadToCurrentCollection = Boolean(currentCollection && canManageCurrentCollection && (
        ['creations_public', 'creations_private'].includes(String(currentCollection.id)) || !currentCollection.original_creation
    ))
    const [isLoadingCollection, setIsLoadingCollection] = useState(false)
    const [items, setItems] = useState<CollectionItem[]>([])
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        uploadIsPublic?: boolean;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } })
    const isUploadConfirmation = confirmModal.uploadIsPublic !== undefined;
    const uploadPolicy = useSkinLicensePolicy({ operation: 'save',
        isPublic: confirmModal.uploadIsPublic, enabled: confirmModal.isOpen && isUploadConfirmation })
    const [newCollectionName, setNewCollectionName] = useState('')
    const [isNewCollectionPublic, setIsNewCollectionPublic] = useState(true)
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
    const [itemToMove, setItemToMove] = useState<CollectionItem | null>(null)
    const canMoveItem = isMoveModalOpen && canUploadToCurrentCollection && !!itemToMove && typeof itemToMove.data.is_public === 'boolean' &&
        String(itemToMove.collection_id) === String(currentCollection?.id)
    const moveCollections = useCollectionMoveTargets({
        enabled: canMoveItem, sourceCollectionId: currentCollection?.id, skinIsPublic: itemToMove?.data.is_public,
    })
    useEffect(() => {
        setIsMoveModalOpen(false)
        setItemToMove(null)
    }, [authSession, pathCollectionId, sharedId])
    const [isUploadPickerOpen, setIsUploadPickerOpen] = useState(false)
    const [uploadPickerTab, setUploadPickerTab] = useState<'public' | 'private'>('public')
    const [uploadPickerCollections, setUploadPickerCollections] = useState<Collection[]>([])
    const [selectedUploadCollection, setSelectedUploadCollection] = useState<Collection | null>(null)
    const [uploadPickerPage, setUploadPickerPage] = useState(1)
    const [uploadPickerTotalPages, setUploadPickerTotalPages] = useState(1)
    const [isLoadingUploadPicker, setIsLoadingUploadPicker] = useState(false)
    const homeUploadInputRef = useRef<HTMLInputElement>(null)

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

    useEffect(() => {
        if (!authSession || !myUserId || !userId || userId === myUserId) return
        const controller = new AbortController()
        const loadOwner = async () => {
            const response = await apiFetch(`/api/users/${encodeURIComponent(userId)}/profile`, {
                signal: controller.signal, auth: 'required', skipGlobalError: true,
            })
            if (!response.ok) return
            const profile: CollectionOwner = await apiResponseJson(response)
            if (!controller.signal.aborted && String(profile.id) === userId) {
                setOwnerSnapshot({ session: authSession, userId, profile })
            }
        }
        void loadOwner().catch(error => {
            if (!controller.signal.aborted) console.error('Failed to load collection owner', error)
        })
        return () => controller.abort()
    }, [authSession, myUserId, userId])

    const fetchCollections = useCallback(async (page: number = 1, targetUserId?: string, isPublic?: boolean, signal?: AbortSignal) => {
        const isMe = !targetUserId || targetUserId === myUserId;
        // If we don't specify isPublic, we might be fetching for someone else or initial load
        // But for "independent" UI, we should specify.

        setIsLoading(true)
        try {
            let url = isMe ? `/api/collections?page=${page}&page_size=12` : `/api/users/${targetUserId}/collections?page=${page}&page_size=12`;
            if (isPublic !== undefined) {
                url += `&is_public=${isPublic}`
            }
            const response = await apiFetch(url, { signal });
            if (response.ok) {
                const data = await apiResponseJson(response)
                if (signal?.aborted) return
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
                    setPublicCollections(data.items.filter((c: Collection) => c.is_public))
                    setPrivateCollections(data.items.filter((c: Collection) => !c.is_public))
                    // This fallback isn't ideal for total pages, but isMe fetch usually specifies isPublic now.
                }

                // Later custom pages omit the default collections.
                if (page === 1 && data.original_items) {
                    setOriginalCollections(data.original_items)
                }
            }
        } catch (e) {
            if (!signal?.aborted) console.error('Failed to fetch collections', e)
        } finally {
            if (!signal?.aborted) setIsLoading(false)
        }
    }, [myUserId])

    const fetchItems = useCallback(async (collectionId: number | string, page: number = 1, targetUserId?: string, signal?: AbortSignal) => {
        setIsLoading(true)

        try {
            const uid = targetUserId || (collectionId === 'liked' || collectionId === 'creations_private' ? myUserId : userId);
            let url = `/api/collections/items?collection_id=${collectionId}&user_id=${uid}&page=${page}&page_size=24`
            if (filterName) url += `&name=${encodeURIComponent(filterName)}`
            if (filterMode) url += `&mode=${filterMode}`
            const response = await apiFetch(url, { signal })
            if (response.ok) {
                const data = await apiResponseJson(response)
                if (signal?.aborted) return
                setItems(data.items)
                setItemTotalPages(data.total_pages)
                setItemPage(data.page)
                setTotalItems(data.total)
            }
        } catch (e) {
            if (!signal?.aborted) console.error('Failed to fetch items', e)
        } finally {
            if (!signal?.aborted) setIsLoading(false)
        }
    }, [myUserId, userId, filterName, filterMode])

    useEffect(() => {
        setPublicCollections([])
        setPrivateCollections([])
        setOriginalCollections([])
        setItems([])
        setCurrentCollection(null)
        setPublicColPage(1)
        setPrivateColPage(1)
        setItemPage(1)
        setIsCreateModalOpen(false)
        setIsRenameModalOpen(false)
        setIsUploadPickerOpen(false)
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
    }, [authSession, userId])

    useEffect(() => {
        if (!isUploadPickerOpen) return
        let isCancelled = false

        const fetchUploadTargets = async () => {
            setIsLoadingUploadPicker(true)
            try {
                const isPublic = uploadPickerTab === 'public'
                const response = await apiFetch(`/api/collections?page=${uploadPickerPage}&page_size=6&is_public=${isPublic}&show_original_creation=false`)
                if (isCancelled) return
                if (!response.ok) {
                    setUploadPickerCollections([])
                    setUploadPickerTotalPages(1)
                    return
                }

                const data = await apiResponseJson(response)
                if (isCancelled) return
                const originalId = isPublic ? 'creations_public' : 'creations_private'
                const loadedOriginal = originalCollections.find(collection => String(collection.id) === originalId)
                const originalTarget: Collection = loadedOriginal
                    ? {
                        ...loadedOriginal,
                        name: isPublic ? current.collection.creationsPublic : current.collection.creationsPrivate
                    }
                    : {
                        id: originalId,
                        name: isPublic ? current.collection.creationsPublic : current.collection.creationsPrivate,
                        is_public: isPublic,
                        item_count: 0,
                        original_creation: true,
                        user_id: myUserId || undefined
                    }

                setUploadPickerCollections([originalTarget, ...(data.items || [])])
                setUploadPickerPage(data.page || uploadPickerPage)
                setUploadPickerTotalPages(Math.max(1, data.total_pages || 1))
            } catch (error) {
                if (!isCancelled) {
                    console.error('Failed to fetch upload target collections', error)
                    setUploadPickerCollections([])
                    setUploadPickerTotalPages(1)
                }
            } finally {
                if (!isCancelled) setIsLoadingUploadPicker(false)
            }
        }

        void fetchUploadTargets()
        return () => {
            isCancelled = true
        }
    }, [
        current.collection.creationsPrivate,
        current.collection.creationsPublic,
        isUploadPickerOpen,
        myUserId,
        originalCollections,
        uploadPickerPage,
        uploadPickerTab
    ])

    // Cache updates do not trigger route loads; read the latest metadata when a route loads.
    const findRouteCollection = useEffectEvent((id: string, ownerId: string) =>
        [currentCollection, ...publicCollections, ...privateCollections, ...originalCollections].find(collection =>
            collection && String(collection.id) === id && String(collection.user_id) === ownerId));

    useEffect(() => {
        // Resolve ownership first so an early public-only response cannot
        // overwrite the owner's liked and private collections.
        if (!authSession || !myUserId) return;

        // 2. Handle automatic redirect to /skin/collection/{myUserId}
        if (!userId && myUserId) {
            navigate(`/skin/collection/${myUserId}`, { replace: true });
            return;
        }

        // 3. Handle data fetching based on params
        const controller = new AbortController()
        setIsLoadingCollection(false)
        if (userId) {
            if (pathCollectionId) {
                const ownerId = pathCollectionId === 'liked' || pathCollectionId === 'creations_private' ? myUserId : userId;
                {
                    const found = findRouteCollection(pathCollectionId, ownerId);

                    if (found) {
                        setCurrentCollection(found);
                    } else {
                        setCurrentCollection(null);
                        const defaultName = pathCollectionId === 'liked' ? current.collection.myLikes
                            : pathCollectionId === 'creations_public' ? publicCreationsName
                            : pathCollectionId === 'creations_private' ? current.collection.creationsPrivate : null;
                        if (defaultName) {
                            setCurrentCollection({
                                id: pathCollectionId, name: defaultName, item_count: 0, original_creation: true,
                                is_public: pathCollectionId === 'creations_public',
                                user_id: pathCollectionId === 'creations_public' ? userId : myUserId,
                            });
                        } else {
                            setIsLoadingCollection(true);
                            // A direct link has no cached collection metadata. Resolve its owner and
                            // visibility before allowing uploads, including collections on later pages.
                            const loadCollection = async () => {
                                const baseUrl = userId === myUserId ? '/api/collections' : `/api/users/${userId}/collections`;
                                let page = 1;
                                let totalPages = 1;
                                do {
                                    const response = await apiFetch(`${baseUrl}?page=${page}&page_size=100&show_original_creation=false`, { signal: controller.signal });
                                    if (!response.ok) return;
                                    const data = await apiResponseJson(response);
                                    if (controller.signal.aborted) return;
                                    const collection = (data.items as Collection[]).find(candidate => String(candidate.id) === String(pathCollectionId));
                                    if (collection) {
                                        setCurrentCollection(collection);
                                        return;
                                    }
                                    totalPages = data.total_pages;
                                    page += 1;
                                } while (page <= totalPages);
                            };
                            void loadCollection().catch(error => {
                                if (!controller.signal.aborted) console.error('Failed to load collection details', error);
                            }).finally(() => {
                                if (!controller.signal.aborted) setIsLoadingCollection(false);
                            });
                        }
                    }
                }
                fetchItems(pathCollectionId, itemPage, userId, controller.signal);
            } else {
                // List view
                setCurrentCollection(null);
                if (userId === myUserId) {
                    fetchCollections(publicColPage, userId, true, controller.signal);
                    fetchCollections(privateColPage, userId, false, controller.signal);
                } else {
                    fetchCollections(publicColPage, userId, true, controller.signal);
                }
            }
        }
        return () => controller.abort()
    }, [authSession, userId, pathCollectionId, myUserId, publicColPage, privateColPage, itemPage, fetchItems, fetchCollections, navigate, current.collection.myLikes, publicCreationsName, current.collection.creationsPrivate]);

    useEffect(() => {
        const controller = new AbortController()
        if (sharedId && authSession) {
            setCurrentCollection({ id: sharedId, name: current.collection.publicCollection, is_public: true, item_count: 0, original_creation: false });
            fetchItems(sharedId, 1, undefined, controller.signal);
        }
        return () => controller.abort()
    }, [authSession, sharedId, current.collection.publicCollection, fetchItems]);

    const renderPreviewStack = (previews?: Pick<CollectionItem, 'id' | 'data'>[]) => {
        if (!previews || previews.length === 0) return null;
        return (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {previews.slice(0, 3).map((item, idx) => (
                    <Skin2DImg
                        key={idx}
                        src={item.data.result || item.data.url || ''}
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

    const refreshCollectionSummaryAfterUpload = (collection: Collection, uploadedItem: UploadedCollectionItem) => {
        if (currentCollection && String(currentCollection.id) === String(collection.id)) {
            void fetchItems(collection.id, itemPage)
            return
        }

        const preview = {
            id: uploadedItem.log_id || uploadedItem.id || `${Date.now()}`,
            data: uploadedItem.data || { result: uploadedItem.result_url }
        }
        const updateCollection = (candidate: Collection) => ({
            ...candidate,
            item_count: candidate.item_count + 1,
            previews: [preview, ...(candidate.previews || [])].slice(0, 3)
        })
        const sourceCollectionId = collection.is_public ? 'creations_public' : 'creations_private'

        setOriginalCollections(collections => collections.map(candidate =>
            String(candidate.id) === sourceCollectionId ? updateCollection(candidate) : candidate
        ))

        if (!collection.original_creation) {
            const updateTarget = (collections: Collection[]) => collections.map(candidate =>
                String(candidate.id) === String(collection.id) ? updateCollection(candidate) : candidate
            )
            if (collection.is_public) {
                setPublicCollections(updateTarget)
            } else {
                setPrivateCollections(updateTarget)
            }
        }
    }

    const uploadConfirmedItem = async (file: File, collection: Collection) => {
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
        formData.append('license_consent', 'true');
        formData.append('public_license_consent', String(collection.is_public));

        try {
            let uploadColId = collection.id;
            const isCustom = !['creations_public', 'creations_private'].includes(String(collection.id));
            if (isCustom) {
                uploadColId = collection.is_public ? 'creations_public' : 'creations_private';
            }

            const response = await apiFetch(`/api/collections/${uploadColId}/upload`, {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                const data = await apiResponseJson(response).catch(() => ({})) as UploadedCollectionItem;
                if (isCustom) {
                    const linkResponse = await apiFetch('/api/collections/items', {
                        method: 'POST',
                        body: JSON.stringify({
                            collection_id: String(collection.id),
                            name: data.name || file.name.replace(/\.[^/.]+$/, ""),
                            type: 'human_upload',
                            log_id: data.log_id || data.id,
                            data: data.data || {}
                        })
                    });
                    if (linkResponse.ok) {
                        refreshCollectionSummaryAfterUpload(collection, data);
                    } else {
                        const errorData = await linkResponse.json().catch(() => ({}));
                        showError(errorData.detail || current.collection.uploadFailed);
                    }
                } else {
                    refreshCollectionSummaryAfterUpload(collection, data);
                }
            } else {
                showError(current.collection.uploadFailed);
            }
        } catch (e) {
            console.error('Failed to upload item', e);
        }
    };

    const prepareUpload = (file: File, collection: Collection) => {
        if (file.size > 512 * 1024) {
            showError(current.collection.fileTooLarge);
            return;
        }
        if (!collection.is_public && !isPro) {
            showError(current.collection.privateQuotaExceeded);
            return;
        }
        if (!collection.is_public) {
            void uploadConfirmedItem(file, collection);
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: current.collection.uploadLicenseTitle,
            message: `${current.edit.importRightsMessage}\n\n${current.edit.publicSaveRightsMessage}`,
            uploadIsPublic: true,
            onConfirm: () => {
                void uploadConfirmedItem(file, collection);
            }
        });
    }

    const handleUploadItem = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const collection = currentCollection;
        // Reset immediately so choosing the same file again still triggers change.
        e.target.value = '';
        if (!file || !collection) return;

        prepareUpload(file, collection)
    };

    const handleHomeUploadItem = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        const collection = selectedUploadCollection
        e.target.value = ''
        if (!file || !collection) return

        setIsUploadPickerOpen(false)
        prepareUpload(file, collection)
    }

    const handleMoveItem = async (targetCollectionId: string | number) => {
        if (!itemToMove || !canMoveItem || moveCollections.status !== 'ready' ||
            !moveCollections.targets.some(collection => String(collection.id) === String(targetCollectionId))) return;
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
                const errorData = await apiResponseJson(response);
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

    const handleDeleteItem = async (e: React.MouseEvent, id: CollectionItem['id']) => {
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
            const warnMsg = current.collection.confirmPermanentDelete + 
                (!isPro ? current.collection.freeDeleteWarning : '');
            
            setConfirmModal({
                isOpen: true,
                title: current.collection.confirmDeleteTitle,
                message: warnMsg,
                onConfirm: async () => {
                    try {
                        const response = await apiFetch(`/api/logs/${id}`, {
                            method: 'DELETE'
                        })
                        if (!response.ok) {
                            if (response.status === 403) {
                                setTimeout(() => {
                                    setConfirmModal({
                                        isOpen: true,
                                        title: current.collection.deleteQuotaExceededTitle,
                                        message: current.collection.deleteQuotaExceeded,
                                        onConfirm: () => {
                                            navigate('/pro');
                                        }
                                    });
                                }, 200);
                                return;
                            }
                            const err = await apiResponseJson(response).catch(() => ({}));
                            const isCdnPending = typeof err?.detail === 'string' && (
                                err.detail.includes('CDN withdrawal is pending') ||
                                err.detail.toLowerCase().includes('cdn')
                            );
                            if (isCdnPending) {
                                window.dispatchEvent(new Event('user-updated'));
                                if (currentCollection) {
                                    fetchItems(currentCollection.id, pageToFetch);
                                }
                                return;
                            }
                            alert(err.detail || err.error || current.common.requestFailed);
                            return;
                        }
                        if (response.ok) {
                            window.dispatchEvent(new Event('user-updated'));
                            if (currentCollection) {
                                fetchItems(currentCollection.id, pageToFetch);
                            }
                        }
                    } catch (e) {
                        console.error('Failed to delete creation', e)
                        alert(current.common.requestFailed)
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

    if (!authSession) {
        return (
            <PageContainer className="items-center justify-center">
                <SEO title={current.nav.collection} description={current.collection.loginPrompt} />
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

    const collectionName = currentCollection?.id === 'creations_public' ? publicCreationsName : currentCollection?.name
    const collectionTitle = currentCollection
        ? `${collectionName} | ${pageTitle}`
        : pageTitle;

    return (
        <PageContainer className="relative">
            <SEO title={collectionTitle} description={pageSubtitle} />

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/10 pb-6 shrink-0 w-full">
                    <div className="flex items-center gap-3 sm:gap-4 w-full min-w-0 md:flex-1">
                        {isOtherCollectionPage && (
                            <SkinAvatarImage
                                textureUrl={collectionOwner?.skin_url}
                                fallbackSrc={collectionOwner?.picture}
                                alt={ownerName}
                                className="w-12 h-12 sm:w-16 sm:h-16 border border-white/10"
                                framed={false}
                            />
                        )}
                        <div className="min-w-0">
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
                                        }}
                                        className="p-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer shrink-0"
                                    >
                                        <Icon icon="pixelarticons:arrow-left" className="text-xl" />
                                    </button>
                                )}
                                <h2 className={`text-white text-2xl sm:text-3xl m-0 truncate ${current.fontClass}`}>
                                    {currentCollection ? collectionName : pageTitle}
                                </h2>
                            </div>
                            <p className={`text-white/40 text-sm ${current.fontClass}`}>
                                {currentCollection
                                    ? `${totalItems}`
                                    : pageSubtitle
                                }
                            </p>
                            {isOtherCollectionPage && (
                                <p className={`mt-1 text-white/50 text-xs break-all ${current.fontClass}`}>
                                    {currentCollection && <span>{ownerName} · </span>}
                                    <span>{current.collection.userId}: {userId}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto">
                        {!currentCollection && isOwnCollectionPage && (
                            <div className="flex w-full items-center gap-2 md:w-auto">
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 border-2 border-black bg-[#3c8527] px-4 py-2 text-xs text-white transition-all hover:bg-[#4ea632] active:translate-y-0.5 md:flex-none ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:plus" />
                                    {current.collection.btnNew}
                                </button>

                                <div className={`relative flex-1 md:flex-none ${isUploadPickerOpen ? 'z-[60]' : ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isUploadPickerOpen) {
                                                setIsUploadPickerOpen(false)
                                                return
                                            }
                                            setUploadPickerTab('public')
                                            setUploadPickerPage(1)
                                            setSelectedUploadCollection(null)
                                            setIsUploadPickerOpen(true)
                                        }}
                                        aria-expanded={isUploadPickerOpen}
                                        className={`flex w-full cursor-pointer items-center justify-center gap-2 border-2 border-black bg-[#3c8527] px-4 py-2 text-xs text-white transition-all hover:bg-[#4ea632] active:translate-y-0.5 ${current.fontClass}`}
                                    >
                                        <Icon icon="pixelarticons:upload" />
                                        {current.collection.upload}
                                    </button>

                                    <input
                                        ref={homeUploadInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleHomeUploadItem}
                                    />

                                    {isUploadPickerOpen && (
                                        <button
                                            type="button"
                                            aria-label={current.modal.cancel}
                                            onClick={() => setIsUploadPickerOpen(false)}
                                            className="fixed inset-0 z-40 cursor-default"
                                        />
                                    )}

                                    <AnimatePresence>
                                        {isUploadPickerOpen && (
                                            <CollectionUploadPicker
                                                current={current}
                                                collections={uploadPickerCollections}
                                                activeTab={uploadPickerTab}
                                                selectedCollectionId={selectedUploadCollection?.id ?? null}
                                                page={uploadPickerPage}
                                                totalPages={uploadPickerTotalPages}
                                                isLoading={isLoadingUploadPicker}
                                                isPrivateUploadDisabled={!isPro}
                                                onTabChange={(tab) => {
                                                    setUploadPickerTab(tab)
                                                    setUploadPickerPage(1)
                                                    setSelectedUploadCollection(null)
                                                }}
                                                onSelectCollection={setSelectedUploadCollection}
                                                onPageChange={(page) => {
                                                    setUploadPickerPage(page)
                                                    setSelectedUploadCollection(null)
                                                }}
                                                onChooseImage={() => homeUploadInputRef.current?.click()}
                                                onClose={() => setIsUploadPickerOpen(false)}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
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
                                            {current.collection.labelDefault}
                                        </span>
                                        <div className="h-px flex-1 bg-white/5" />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                        {originalCollections.filter(col => isOwnCollectionPage || col.is_public).map((col) => {
                                            const isLiked = col.id === 'liked';
                                            const isPubCreations = col.id === 'creations_public';
                                            const isPrivCreations = col.id === 'creations_private';

                                            const localizedName = isLiked ? current.collection.myLikes
                                                : isPubCreations ? publicCreationsName
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
                                                {current.collection.labelPublic}
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

                                                    {isOwnCollectionPage && String(col.user_id) === myUserId && (
                                                        <div className="absolute top-2 left-2 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-20">
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
                                                    )}

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
                            {isOwnCollectionPage && privateCollections.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-white/20 text-[10px] uppercase tracking-widest font-bold ${current.fontClass}`}>
                                                {current.collection.labelPrivate}
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

                                                    {isOwnCollectionPage && String(col.user_id) === myUserId && (
                                                        <div className="absolute top-2 left-2 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-20">
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
                                                    )}

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
                                                    src={item.data.result_render_2d || item.data.result || item.data.url || item.data.preview || ''}
                                                    className="w-full h-full object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            {canManageCurrentCollection && (
                                                <button
                                                    onClick={(e) => handleDeleteItem(e, item.id)}
                                                    title={current.collection.btnDelete}
                                                    className="absolute top-2 left-2 p-1 bg-red-900/40 hover:bg-red-600 text-white/60 hover:text-white border border-white/10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Icon icon="pixelarticons:close" className="text-xs" />
                                                </button>
                                            )}
                                            {canUploadToCurrentCollection && currentCollection && !currentCollection.original_creation && typeof item.data.is_public === 'boolean' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); moveCollections.reload(); setItemToMove(item); setIsMoveModalOpen(true); }}
                                                    className="absolute top-2 right-2 p-1 bg-green-900/40 hover:bg-green-600 text-white/60 hover:text-white border border-white/10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                                    title={current.collection.moveToCollection}
                                                >
                                                    <Icon icon="pixelarticons:folder-minus" className="text-xs" />
                                                </button>
                                            )}
                                            <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/5 transition-colors pointer-events-none" />
                                            {typeof item.data.is_public === 'boolean' && (
                                                <span className={`absolute bottom-2 right-2 z-10 flex items-center gap-1 border bg-black/75 px-1.5 py-0.5 text-[9px] uppercase pointer-events-none ${current.fontClass} ${item.data.is_public
                                                    ? 'border-blue-400/30 text-blue-300'
                                                    : 'border-orange-400/30 text-orange-300'}`}>
                                                    <Icon icon={item.data.is_public ? 'pixelarticons:earth' : 'pixelarticons:lock'} className="text-[10px]" />
                                                    {item.data.is_public ? current.collection.public : current.collection.private}
                                                </span>
                                            )}
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
                    <div className="mt-auto pt-3 sm:pt-6 border-t border-white/5 flex flex-row items-center justify-between gap-2 sm:gap-4 shrink-0 w-full">
                        {/* Left: Pagination */}
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {currentCollection && itemTotalPages > 1 && (
                                <>
                                    <button
                                        disabled={isLoading || itemPage === 1}
                                        onClick={() => setItemPage(p => Math.max(1, p - 1))}
                                        className="p-1 sm:p-2 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                                    >
                                        <Icon icon={isLoading ? "pixelarticons:reload" : "pixelarticons:chevron-left"} className={`text-xs sm:text-base ${isLoading ? "animate-spin" : ""}`} />
                                    </button>

                                    <div className={`text-white/40 text-[10px] sm:text-xs px-0.5 ${current.fontClass}`}>
                                        {`${itemPage}/${itemTotalPages}`}
                                    </div>

                                    <button
                                        disabled={isLoading || itemPage === itemTotalPages}
                                        onClick={() => setItemPage(p => Math.min(itemTotalPages, p + 1))}
                                        className="p-1 sm:p-2 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                                    >
                                        <Icon icon={isLoading ? "pixelarticons:reload" : "pixelarticons:chevron-right"} className={`text-xs sm:text-base ${isLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Right: Actions (Upload & Generate) */}
                        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 ml-auto">
                            {currentCollection && (
                                <button
                                    onClick={() => navigate('/skin/generate')}
                                    className={`px-2 py-1.5 sm:px-4 sm:py-2 bg-[#1a1a1a] hover:bg-white/10 text-white border border-white/10 sm:border-2 cursor-pointer text-[10px] sm:text-xs flex items-center justify-center gap-1 sm:gap-2 transition-all active:translate-y-0.5 whitespace-nowrap ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:zap" className="text-xs sm:text-sm" />
                                    <span>{current.collection.btnGenerate}</span>
                                </button>
                            )}

                            {canUploadToCurrentCollection && (
                                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                                    <input
                                        id="upload-item-input"
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleUploadItem}
                                    />
                                    {(!isPro && !currentCollection.is_public) ? (
                                        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                                            <div
                                                onClick={() => navigate('/pro')}
                                                className="flex items-center justify-center gap-1 px-1.5 py-1 sm:px-2 sm:py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 cursor-pointer hover:bg-yellow-400/20 transition-all animate-in fade-in slide-in-from-left-2 duration-300"
                                            >
                                                <Icon icon="pixelarticons:zap" className="text-[10px] sm:text-xs" />
                                                <span className={`text-[8px] sm:text-[10px] font-bold ${current.fontClass}`}>
                                                    {current.generate.privateTip}
                                                </span>
                                            </div>
                                            <button
                                                disabled
                                                className={`px-2 py-1.5 sm:px-4 sm:py-2 bg-gray-700 text-white/40 border border-black sm:border-2 cursor-not-allowed text-[10px] sm:text-xs flex items-center justify-center gap-1 sm:gap-2 transition-all whitespace-nowrap ${current.fontClass}`}
                                            >
                                                <Icon icon="pixelarticons:upload" className="text-xs sm:text-sm" />
                                                <span>{current.collection.upload}</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                document.getElementById('upload-item-input')?.click();
                                            }}
                                            className={`px-2 py-1.5 sm:px-4 sm:py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-black sm:border-2 cursor-pointer text-[10px] sm:text-xs flex items-center justify-center gap-1 sm:gap-2 transition-all active:translate-y-0.5 whitespace-nowrap ${current.fontClass}`}
                                        >
                                            <Icon icon="pixelarticons:upload" className="text-xs sm:text-sm" />
                                            <span>{current.collection.upload}</span>
                                        </button>
                                    )}
                                </div>
                            )}
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
                                name: selectedItem.name,
                                mode: 'human_upload',
                                source: '',
                                creator: { id: '', username: '' },
                                timestamp: '',
                                likes_count: 0,
                                is_liked: false,
                                model_version: '',
                                is_pro: false,
                                result: selectedItem.data.result || selectedItem.data.url || '',
                                is_public: selectedItem.data.is_public === true
                            }}
                            current={current}
                            textureUrl={selectedItem.data.result || selectedItem.data.url || ''}
                            closeModal={() => setSelectedItem(null)}
                            onEdit={(texUrl, logId, isPublic, name) => navigate('/skin/edit', { state: { textureUrl: texUrl, passedLogId: logId, isPublic, name } })}

                            onAiEdit={(source: string, id: string, isPublic: boolean) => navigate('/skin/generate', { state: { sourceImage: source, sourceId: id, mode: 'aigc_image_edit_to_skin', isPublic } })}
                        />
                    )}
                </AnimatePresence>

                {/* Move Item Modal */}
                {canMoveItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                        <div role="dialog" aria-modal="true" aria-label={current.collection.moveToCollection} className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {current.collection.moveToCollection}
                            </h3>

                            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {moveCollections.status === 'loading' && (
                                    <p role="status" className={`m-0 py-4 text-center text-xs text-white/40 ${current.fontClass}`}>{current.mcmodal.loading}</p>
                                )}
                                {moveCollections.status === 'error' && (
                                    <div className={`flex flex-col gap-2 text-xs ${current.fontClass}`}>
                                        <p role="alert" className="m-0 text-white/60">{current.collection.moveCollectionsLoadFailed}</p>
                                        <button type="button" onClick={moveCollections.reload} className="cursor-pointer self-center px-3 py-2 text-white/80 hover:text-white underline underline-offset-2">
                                            {current.collection.retry}
                                        </button>
                                    </div>
                                )}
                                {moveCollections.targets.map(col => (
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
                                {moveCollections.status === 'ready' && moveCollections.targets.length === 0 && (
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
                        <div role="dialog" aria-modal="true" aria-label={confirmModal.title} className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                            <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                                {confirmModal.title}
                            </h3>

                            <p className={`text-white/60 text-sm whitespace-pre-wrap ${current.fontClass}`}>
                                {confirmModal.message}
                            </p>

                            {isUploadConfirmation && !uploadPolicy.ready && (
                                <p role={uploadPolicy.code === 'unavailable' ? 'alert' : 'status'}
                                    className={`m-0 text-xs text-white/55 ${current.fontClass}`}>
                                    {uploadPolicy.code === 'unavailable'
                                        ? current.skinLicense.unavailableDescription
                                        : current.skinLicense.loading}
                                </p>
                            )}

                            <div className="flex gap-3 justify-end mt-1">
                                <button
                                    onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                    className={`px-4 py-2 text-white/40 hover:text-white text-xs cursor-pointer transition-colors ${current.fontClass}`}
                                >
                                    {current.modal.cancel}
                                </button>
                                <button
                                    onClick={() => {
                                        if (isUploadConfirmation && !uploadPolicy.ready) return;
                                        confirmModal.onConfirm();
                                        setConfirmModal({ ...confirmModal, isOpen: false });
                                    }}
                                    disabled={isUploadConfirmation && !uploadPolicy.ready}
                                    className={`disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 bg-red-800 hover:bg-red-600 text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                                >
                                    {current.modal.confirm}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {(isLoading || isLoadingCollection) && <LoadingPlaceholder current={current} />}
        </PageContainer>
    )
}
