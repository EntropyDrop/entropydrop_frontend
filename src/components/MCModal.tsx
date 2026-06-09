import { Icon } from '@iconify/react'
import { useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { GenerationLogItem } from '../types/log'
import { MCModalSidebar } from './MCModalSidebar'
import { MCModalPreview } from './MCModalPreview'
import { MCModalDropdown } from './MCModalDropdown'
import { Skin2DImg } from './Skin2DImg'
import { Skin2D, isSlim, convertSkinLayout } from './utils'
import { showError } from '../utils/alert'
import { apiFetch } from '../utils/api'
import { formatDate } from '../utils/date'
import { GoogleSignInButton } from './GoogleSignInButton'
import { LoadingSpinner } from './LoadingPlaceholder'


export interface Collection {
    id: string;
    name: string;
    item_count: number;
    is_public: boolean;
    username?: string;
    user_id?: number;
}

export interface CollectionItem {
    id: string;
    name: string;
    type: string;
    log_id: string;
    data: {
        id: string;
        result: string;
    };
}

export interface MCModalProps {
    textureUrl: string
    item: GenerationLogItem
    closeModal: () => void
    onEdit?: (isPublic: boolean) => void
    onAiEdit?: (source: string, id: string, isPublic: boolean, sourceType?: 'source' | 'intermediate') => void
    current: any // Use any temporarily to avoid import loops if needed, or LangData
}

export function MCModal({ item: initialItem, closeModal: close, textureUrl: initialTextureUrl, onEdit, onAiEdit, current }: MCModalProps) {




    const navigate = useNavigate();
    const [item, setItem] = useState<GenerationLogItem>(initialItem);
    const [isLoadingDetails, setIsLoadingDetails] = useState(true);
    const [parentItem, setParentItem] = useState<GenerationLogItem | null>(null);
    const [isParentDeleted, setIsParentDeleted] = useState(false);
    const [isNotFound, setIsNotFound] = useState(false);

    const handleEditImage = (src?: string, sourceType?: 'source' | 'intermediate') => {
        close();
        if (onAiEdit && src) {
            onAiEdit(src, item.id, item.is_public === true, sourceType);
        }
    };

    const handlePrint = () => {
        close();
        navigate('/skin/print', { state: { textureUrl, item } });
    };

    const [textureUrl, setTextureUrl] = useState(initialTextureUrl);
    const [mode, setMode] = useState<'voxel' | 'plane'>('voxel');
    const [action, setAction] = useState<'idle' | 'walking' | 'dance'>('walking');
    const [fbxUrl, setFbxUrl] = useState('/fbx/Breakdance 1990.fbx');
    const [modelType, setModelType] = useState<'steve' | 'alex'>('steve');
    const [isLiked, setIsLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [derivedCount, setDerivedCount] = useState<number | null>(null);
    const [relatedCollectionsCount, setRelatedCollectionsCount] = useState<number | null>(null);

    const loadDetails = useCallback(async (id: string, isInitial = false) => {
        if (!id) {
            setIsLoadingDetails(false);
            return;
        }
        if (!isInitial) {
            setIsLoadingDetails(true);
            setDerivedCount(null);
            setRelatedCollectionsCount(null);
        }
        setIsNotFound(false);
        try {
            const res = await apiFetch(`/api/logs/${id}`, { skipGlobalError: true });
            if (res.status === 404 || res.status === 403) {
                setIsNotFound(true);
                setTextureUrl('');
                setParentItem(null);
                setIsParentDeleted(false);
                return;
            }
            if (!res.ok) {
                throw new Error(`Failed with status ${res.status}`);
            }
            const data = await res.json();
            if (!data?.result) {
                setIsNotFound(true);
                setTextureUrl('');
                setParentItem(null);
                setIsParentDeleted(false);
                return;
            }
            setItem(data);
            setTextureUrl(data.result);
            setIsNotFound(false);

            if (data.parent) {
                try {
                    const parentRes = await apiFetch(`/api/logs/${data.parent}`, { skipGlobalError: true });
                    if (parentRes.ok) {
                        const parentData = await parentRes.json();
                        setParentItem(parentData);
                        setIsParentDeleted(false);
                    } else if (parentRes.status === 404) {
                        setParentItem(null);
                        setIsParentDeleted(true);
                    } else {
                        setParentItem(null);
                    }
                } catch (e) {
                    setParentItem(null);
                }
            } else {
                setParentItem(null);
                setIsParentDeleted(false);
            }

            const token = localStorage.getItem('token');
            if (token) {
                // Fetch derived skins count
                apiFetch(`/api/logs/${id}/derived`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data) {
                            setDerivedCount(data.items?.length ?? 0);
                        }
                    })
                    .catch(e => console.error("Failed to fetch derived count", e));

                // Fetch related collections count
                apiFetch(`/api/logs/${id}/public_collections?page=1&page_size=1`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data) {
                            setRelatedCollectionsCount(data.total ?? 0);
                        }
                    })
                    .catch(e => console.error("Failed to fetch related collections count", e));
            } else {
                setDerivedCount(null);
                setRelatedCollectionsCount(null);
            }
        } catch (err) {
            console.error('Failed to fetch detail', err);
        } finally {
            setIsLoadingDetails(false);
        }
    }, [setItem, setTextureUrl, setParentItem, setDerivedCount, setRelatedCollectionsCount]);

    useEffect(() => {
        loadDetails(initialItem.id, true);
    }, [initialItem.id, loadDetails]);

    useEffect(() => {
        if (textureUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = textureUrl;
            img.onload = () => {
                setModelType(isSlim(img) ? 'alex' : 'steve');
            };
        }
    }, [textureUrl]);
    const [isFavorited, setIsFavorited] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [myCollections, setMyCollections] = useState<Collection[]>([]);
    const [mySelectedIds, setMySelectedIds] = useState<string[]>([]);
    const [isLoadingMyCollections, setIsLoadingMyCollections] = useState(false);
    const [isSavingMyCollections, setIsSavingMyCollections] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
    const [myColPage, setMyColPage] = useState(1);
    const [myColTotalPages, setMyColTotalPages] = useState(1);

    const [showShareToast, setShowShareToast] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isReportSubmitted, setIsReportSubmitted] = useState(false);

    const [currentUser, setCurrentUser] = useState<any>(null);
    const isLoggedIn = !!localStorage.getItem('token');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [hasFeedback, setHasFeedback] = useState(false);
    const [, setFeedbackType] = useState<'good' | 'bad' | null>(null);

    const [isSettingSkin, setIsSettingSkin] = useState(false);
    const [skinSuccess, setSkinSuccess] = useState(false);
    const [skinError, setSkinError] = useState('');

    useEffect(() => {
        if (!isLoggedIn) return;
        const fetchCurrentUser = async () => {
            try {
                const res = await apiFetch('/api/users/me');
                if (res.ok) {
                    const data = await res.json();
                    setCurrentUser(data);
                }
            } catch (err) {
                console.error('Failed to fetch current user', err);
            }
        };
        fetchCurrentUser();
    }, [isLoggedIn]);

    const handleUpdateName = async () => {
        if (!editedName.trim()) return;

        try {
            const res = await apiFetch(`/api/logs/${item.id}/name`, {
                method: 'PATCH',
                body: JSON.stringify({ name: editedName.trim() })
            });
            if (res.ok) {
                setItem(prev => prev ? { ...prev, name: editedName.trim() } : prev);
                setIsEditingName(false);
            } else {
                showError('Failed to update name');
            }
        } catch (err) {

            console.error('Failed to update name', err);
        }
    };

    const handleSetMinecraftSkin = async () => {
        if (!item?.result) return;
        setIsSettingSkin(true);
        setSkinSuccess(false);
        setSkinError('');
        try {
            const res = await apiFetch('/api/users/me/minecraft_skin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ minecraft_skin_url: item.result })
            });
            if (res.ok) {
                setSkinSuccess(true);
                window.dispatchEvent(new Event('user-updated'));
                setTimeout(() => {
                    setSkinSuccess(false);
                }, 2000);
            } else {
                const errData = await res.json();
                setSkinError(errData?.detail || current.mcmodal.setMyCharacterFailed);
            }
        } catch (err) {
            console.error('Failed to set Minecraft skin', err);
            setSkinError(current.mcmodal.setMyCharacterNetworkError);
        } finally {
            setIsSettingSkin(false);
        }
    };

    const renderEditableName = (label: string, value: string, isItalic = false) => {
        const isOwner = currentUser && item.creator?.id === currentUser.id;

        return (
            <div className="min-w-0">
                <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-1">{label}</div>
                {isOwner ? (
                    isEditingName ? (
                        <div className="flex items-center gap-1.5 mt-1">
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="bg-black/40 border border-white/10 text-white font-pixel-hans text-xs px-2 py-1 flex-1 min-w-0"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateName();
                                    if (e.key === 'Escape') setIsEditingName(false);
                                }}
                            />
                            <button
                                onClick={handleUpdateName}
                                className="bg-[#3c8527] hover:bg-[#4ea632] text-white p-1 cursor-pointer border border-black shadow"
                            >
                                <Icon icon="pixelarticons:check" className="text-xs" />
                            </button>
                            <button
                                onClick={() => setIsEditingName(false)}
                                className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-1 cursor-pointer border border-black shadow"
                            >
                                <Icon icon="pixelarticons:close" className="text-xs" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 group/name mt-1">
                            <p className={`text-white/90 font-pixel-hans text-xs leading-snug overflow-hidden text-ellipsis line-clamp-2 ${isItalic ? 'italic' : ''}`}>
                                {isItalic ? `"${value}"` : value || current.mcmodal.noName}
                            </p>
                            <button
                                onClick={() => { setIsEditingName(true); setEditedName(value || ''); }}
                                className="opacity-0 group-hover/name:opacity-60 hover:opacity-100 text-white/40 hover:text-[#4ea632] transition-all cursor-pointer p-0.5"
                                title={current.mcmodal.editName}
                            >
                                <Icon icon="pixelarticons:edit" className="text-xs" />
                            </button>
                        </div>
                    )
                ) : (
                    <p className={`text-white/90 font-pixel-hans text-xs leading-snug overflow-hidden text-ellipsis line-clamp-2 ${isItalic ? 'italic' : ''}`}>
                        {isItalic ? `"${value}"` : value}
                    </p>
                )}
            </div>
        );
    };


    useEffect(() => {
        if (item && item.is_public === false) {
            setActiveTab('private');
        }
    }, [item?.is_public]);

    const [showSidebar, setShowSidebar] = useState(false);
    const [sidebarType, setSidebarType] = useState<'author' | 'containing' | 'derived'>('author');
    const [collections, setCollections] = useState<Collection[]>([]);
    const [expandedCols, setExpandedCols] = useState<string[]>([]);
    const [colPage, setColPage] = useState(1);
    const [colTotalPages, setColTotalPages] = useState(1);
    const [itemsByCol, setItemsByCol] = useState<{ [id: string]: CollectionItem[] }>({});
    const [itemsPageByCol, setItemsPageByCol] = useState<{ [id: string]: number }>({});
    const [itemsTotalPagesByCol, setItemsTotalPagesByCol] = useState<{ [id: string]: number }>({});
    const [isLoadingNav, setIsLoadingNav] = useState(false);
    const [visibleParts, setVisibleParts] = useState({
        head: true,
        body: true,
        leftArm: true,
        rightArm: true,
        leftLeg: true,
        rightLeg: true
    });

    const lastSidebarContext = useRef<{ type: string; id: string } | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const reportButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                isReportOpen &&
                reportRef.current &&
                !reportRef.current.contains(event.target as Node) &&
                reportButtonRef.current &&
                !reportButtonRef.current.contains(event.target as Node)
            ) {
                setIsReportOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isReportOpen]);

    useEffect(() => {
        if (!showSidebar) {
            lastSidebarContext.current = null;
        }
    }, [showSidebar]);

    const togglePart = (part: keyof typeof visibleParts) => {
        setVisibleParts(prev => ({ ...prev, [part]: !prev[part] }));
    };

    useEffect(() => {
        setIsLiked(item.is_liked || false);
        setLikesCount(item.likes_count || 0);
        setHasFeedback(item.has_feedback === true);
        setFeedbackType(null);
    }, [item]);

    useEffect(() => {
        if (!isLoggedIn) return;
        const fetchFavorited = async () => {
            try {
                const res = await apiFetch(`/api/logs/${item.id}/collections`);
                if (res.ok) {
                    const data = await res.json();
                    setIsFavorited(data.length > 0);
                }
            } catch (e) {
                console.error('Failed to fetch favorited status', e);
            }
        };
        fetchFavorited();
    }, [item.id, isLoggedIn]);

    useEffect(() => {
        if (showSidebar) {
            fetchCollections();
        }
    }, [showSidebar, sidebarType, item.id, item.creator?.id]);

    const fetchCollections = async (pageNum: number = 1) => {
        if (sidebarType === 'derived') {
            const isSame = lastSidebarContext.current?.type === sidebarType && lastSidebarContext.current?.id === item.id;
            if (isSame) return;

            setIsLoadingNav(true);
            setCollections([]);
            setExpandedCols([]);
            lastSidebarContext.current = { type: 'derived', id: item.id };
            try {
                const res = await apiFetch(`/api/logs/${item.id}/derived`);
                const data = await res.json();
                setCollections([{ id: 'derived', name: current.mcmodal.allDerived, item_count: data.items?.length || 0, is_public: true }]);
                setItemsByCol({ 'derived': data.items || [] });
                setExpandedCols(['derived']);
            } catch (err) {
                console.error('Failed to fetch derived logs', err);
            } finally {
                setIsLoadingNav(false);
            }
            return;
        }

        const currentId = sidebarType === 'author' ? item.creator?.id : item.id;
        if (!currentId) return;

        const isSame = lastSidebarContext.current?.type === sidebarType && lastSidebarContext.current?.id === currentId;
        if (isSame && pageNum === 1) return;

        setIsLoadingNav(true);
        if (pageNum === 1) {
            setCollections([]);
            setExpandedCols([]);
            lastSidebarContext.current = { type: sidebarType, id: currentId };
        }
        try {
            const url = sidebarType === 'author'
                ? `/api/users/${currentId}/collections?page=${pageNum}&page_size=12`
                : `/api/logs/${currentId}/public_collections?page=${pageNum}&page_size=12`;

            const res = await apiFetch(url);
            const data = await res.json();
            const fetchedItems = data.items || [];

            setCollections(prev => {
                if (pageNum === 1) {
                    return sidebarType === 'author' ? [...(data.original_items || []), ...fetchedItems] : fetchedItems;
                } else {
                    return [...prev, ...fetchedItems];
                }
            });
            setColTotalPages(data.total_pages || 1);
            setColPage(pageNum);
        } catch (err) {
            console.error('Failed to fetch collections', err);
        } finally {
            setIsLoadingNav(false);
        }
    };

    const toggleSidebar = (type: 'author' | 'containing' | 'derived') => {
        if (showSidebar && sidebarType === type) {
            setShowSidebar(false);
        } else {
            setSidebarType(type);
            setShowSidebar(true);
        }
    };

    useEffect(() => {
        if (isDropdownOpen) {
            fetchMyCollections(1);
        }
    }, [isDropdownOpen, item.id, activeTab]);

    const fetchMyCollections = async (pageNum: number = 1) => {
        const isInitial = pageNum === 1;
        if (isInitial) {
            setIsLoadingMyCollections(true);
        }
        try {
            const url = `/api/collections?page=${pageNum}&page_size=12&is_public=${activeTab === 'public'}&show_original_creation=${false}`;
            const colRes = await apiFetch(url);
            const colData = await colRes.json();

            setMyCollections(prev => {
                const items = colData.items || [];
                return isInitial ? items : [...prev, ...items];
            });
            setMyColPage(pageNum);
            setMyColTotalPages(colData.total_pages || 1);

            if (isInitial) {
                const statusRes = await apiFetch(`/api/logs/${item.id}/collections`);
                const statusData = await statusRes.json();
                setMySelectedIds(statusData || []);
            }
        } catch (err) {
            console.error('Failed to fetch user collection data', err);
        } finally {
            if (isInitial) {
                setIsLoadingMyCollections(false);
            }
        }
    };

    const handleToggleMyCollection = (id: string) => {
        setMySelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSaveMyCollection = async () => {
        setIsSavingMyCollections(true);
        try {
            const res = await apiFetch(`/api/logs/${item.id}/collections`, {
                method: 'POST',
                body: JSON.stringify(mySelectedIds)
            });
            if (res.ok) {
                setIsDropdownOpen(false);
                setIsFavorited(mySelectedIds.length > 0);

                // Re-fetch related collections count
                apiFetch(`/api/logs/${item.id}/public_collections?page=1&page_size=1`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data) {
                            setRelatedCollectionsCount(data.total ?? 0);
                        }
                    })
                    .catch(e => console.error("Failed to fetch related collections count", e));
            }
        } catch (err) {
            console.error('Failed to save collections', err);
        } finally {
            setIsSavingMyCollections(false);
        }
    };

    const handleCreateCollection = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!newCollectionName.trim()) return;

        try {
            const res = await apiFetch('/api/collections', {
                method: 'POST',
                body: JSON.stringify({ name: newCollectionName, is_public: activeTab === 'public' })
            });
            if (res.ok) {
                const newCol = await res.json();
                setMyCollections(prev => [...prev, newCol]);
                setMySelectedIds(prev => [...prev, newCol.id]);
                setNewCollectionName('');
            }
        } catch (err) {
            console.error('Failed to create collection', err);
        }
    };

    const fetchCollectionItems = async (colId: string, pageNum: number = 1) => {
        try {
            const targetCol = collections.find(c => c.id === colId);
            const userId = targetCol?.user_id || (sidebarType === 'author' ? item.creator?.id : undefined);
            const tokenUser = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}') : null;
            const fallbackId = userId || tokenUser?.id;

            if (!fallbackId) {
                console.error("user_id is missing for collection item fetch");
                return;
            }

            const url = `/api/collections/items?collection_id=${colId}&user_id=${fallbackId}&page=${pageNum}&page_size=12`;
            const res = await apiFetch(url);
            const data = await res.json();

            setItemsByCol(prev => ({
                ...prev,
                [colId]: pageNum === 1 ? (data.items || []) : [...(prev[colId] || []), ...(data.items || [])]
            }));
            setItemsPageByCol(prev => ({ ...prev, [colId]: pageNum }));
            setItemsTotalPagesByCol(prev => ({ ...prev, [colId]: data.total_pages || 1 }));
        } catch (err) {
            console.error('Failed to fetch collection items', err);
        }
    };

    const toggleCollection = async (colId: string) => {
        const isExpanded = expandedCols.includes(colId);
        if (isExpanded) {
            setExpandedCols(prev => prev.filter(id => id !== colId));
        } else {
            setExpandedCols(prev => [...prev, colId]);
            if (!itemsByCol[colId]) {
                fetchCollectionItems(colId, 1);
            }
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            const res = await apiFetch('/api/auth/google', {
                method: 'POST',
                body: JSON.stringify({ token: credentialResponse.credential })
            })
            if (res.ok) {
                const data = await res.json()
                localStorage.setItem('token', data.access_token)
                location.reload()
            } else {
                console.error('Login failed')
            }
        } catch (err) {
            console.error(err)
        }
    }

    const closeModal = useCallback(() => {
        close();
    }, [close])


    const handleItemSelect = async (logId: string) => {
        await loadDetails(logId);
        if (window.innerWidth < 1024) setShowSidebar(false);
    };

    const handleLike = async () => {
        try {
            const response = await apiFetch(`/api/like/${item.id}`, {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                setIsLiked(data.action === 'liked');
                setLikesCount(data.likes_count);
            }
        } catch (e) {
            console.error('Failed to like', e);
        }
    };

    const handleShare = async () => {
        setIsReportOpen(false);
        setIsDropdownOpen(false);
        const shareUrl = `${window.location.origin}/skin/?id=${item.id}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Minecraft Skin',
                    text: item.name || item.prompt || 'Check out this Minecraft Skin!',
                    url: shareUrl,
                });
            } catch (err) {
                console.log('Share failed', err);
            }
        } else {
            try {
                await navigator.clipboard.writeText(shareUrl);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        }
    };

    const handleReport = () => {
        setIsDropdownOpen(false);
        setIsReportOpen(prev => !prev);
        setIsReportSubmitted(false);
    };

    const submitReport = async (reason: string) => {
        console.log('Report submitted for reason:', reason);

        // Construct email subject and body
        const subject = `${current.mcmodal.reportEmailSubject} - ${reason}`;
        const body = `Item ID: ${item.id}\nReason: ${reason}\nUser: ${currentUser?.username || 'Guest'} (${currentUser?.id || 'N/A'})`;

        // Trigger mailto link
        window.location.href = `mailto:support@entropydrop.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        setIsReportSubmitted(true);
        setTimeout(() => {
            setIsReportOpen(false);
            setIsReportSubmitted(false);
        }, 1500);
    };

    const handleQualityFeedback = async (isSuccess: boolean) => {
        if (!item.id) return;
        try {
            setHasFeedback(true);
            setFeedbackType(isSuccess ? 'good' : 'bad');

            await apiFetch(`/api/logs/${item.id}/feedback`, {
                method: 'POST',
                body: JSON.stringify({ is_good: isSuccess })
            });
        } catch (err) {
            console.error('Failed to submit feedback', err);
        }
    };

    const hasUserFeedback = hasFeedback || item.has_feedback === true;

    const convertModel = (target: 'steve' | 'alex') => {
        if (modelType === target) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = textureUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);

            convertSkinLayout(canvas, target);

            setTextureUrl(canvas.toDataURL());
            setModelType(target);
        };
    };

    const modalContent = (
        <div className="fixed top-[64px] sm:top-0 inset-x-0 bottom-0 sm:inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60" onClick={closeModal}>

            <AnimatePresence>
                {showShareToast && (
                    <motion.div
                        key="share-toast"
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-[#1a1a1a] border border-[#4ea632]/50 text-[#4ea632] px-4 py-2 font-pixel-hans text-xs shadow-[0_4px_20px_rgba(78,166,50,0.2)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2">
                            <Icon icon="pixelarticons:check" className="text-sm" />
                            {current.mcmodal.linkCopied}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {item && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0.1, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0.1 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className={`pointer-events-auto flex items-center justify-center sm:p-4 w-full h-full lg:h-auto [@media(max-height:850px)]:lg:h-full transition-[max-width] duration-300 ${showSidebar ? 'max-w-[1280px]' : 'max-w-[950px]'}`}
                        onClick={closeModal}
                    >
                        <div
                            className="bg-[#121212] sm:border-2 border-white/10 w-full h-full sm:h-auto sm:w-fit flex flex-col lg:flex-row text-white shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-y-auto lg:overflow-hidden max-h-screen lg:max-h-[85vh] [@media(max-height:850px)]:lg:h-full [@media(max-height:850px)]:lg:max-h-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {isNotFound ? (
                                <div className="w-[400px] h-[300px] flex flex-col items-center justify-center p-8 text-center gap-3 bg-[#121212] text-white mx-auto">
                                    <Icon icon="pixelarticons:warning-box" className="text-4xl text-red-500/80" />
                                    <p className="font-pixel-hans text-sm text-white/90">{current.mcmodal.notFound}</p>
                                </div>
                            ) : (
                                <>
                                    {/* Author Collections Sidebar */}
                                    <AnimatePresence>
                                        {showSidebar && (
                                            <MCModalSidebar
                                                sidebarType={sidebarType}
                                                item={item}
                                                parentItem={parentItem}
                                                collections={collections}
                                                expandedCols={expandedCols}
                                                itemsByCol={itemsByCol}
                                                isLoadingNav={isLoadingNav}
                                                toggleCollection={toggleCollection}
                                                handleItemSelect={handleItemSelect}
                                                setShowSidebar={setShowSidebar}
                                                colPage={colPage}
                                                colTotalPages={colTotalPages}
                                                onLoadMore={() => fetchCollections(colPage + 1)}
                                                itemsPageByCol={itemsPageByCol}
                                                itemsTotalPagesByCol={itemsTotalPagesByCol}
                                                onLoadMoreItems={(colId: string) => fetchCollectionItems(colId, (itemsPageByCol[colId] || 1) + 1)}
                                                current={current}
                                            />
                                        )}
                                    </AnimatePresence>
                                    {/* Decorative Corner */}
                                    <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-[#4ea632]/20 to-transparent pointer-events-none" />

                                    {/* Close Button */}

                                    {/* Left: 3D Preview Section */}
                                    <div className={showSidebar ? 'hidden lg:block' : 'block'}>
                                        {isLoadingDetails ? (
                                            <MCModalPreviewPlaceholder />
                                        ) : (
                                            <MCModalPreview
                                                textureUrl={textureUrl}
                                                mode={mode}
                                                action={action}
                                                modelType={modelType}
                                                visibleParts={visibleParts}
                                                setMode={setMode}
                                                setAction={setAction}
                                                fbxUrl={fbxUrl}
                                                setFbxUrl={setFbxUrl}
                                                convertModel={convertModel}
                                                togglePart={togglePart}
                                                onEdit={onEdit ? () => onEdit(item.is_public === true) : undefined}
                                                onPrint={handlePrint}
                                                downloadFilename={item.id ? `skin_${item.id.toString().substring(0, 8)}.png` : 'skin.png'}
                                                current={current}
                                            />
                                        )}
                                    </div>


                                    {/* Right: Info Section */}
                                    {isLoadingDetails ? (
                                        <div className="w-[316px] flex-shrink-0 p-4 flex items-center justify-center bg-[#121212] relative">
                                            <LoadingSpinner className="w-8 h-8 border-4" />
                                        </div>
                                    ) : (
                                        <div className={`w-full lg:w-[316px] flex-shrink-0 flex flex-col bg-[#121212] relative h-auto lg:h-[720px] [@media(max-height:850px)]:lg:h-full border-t lg:border-t-0 lg:border-l border-white/10 ${showSidebar ? 'hidden lg:flex' : 'flex'}`}>
                                            <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-[#38598b]/5 to-transparent pointer-events-none" />

                                            {/* Header Info */}
                                            {isLoggedIn && (
                                                <div className="flex justify-between items-start p-4 pb-2">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="px-2 py-0.5 bg-[#4ea632]/20 text-[#4ea632] text-[10px] font-pixel-hans border border-[#4ea632]/30 ">
                                                                {!item.id ? 'UPLOADED' : (item.mode === 'aigc_text_to_skin' || (item.mode as any) === 'text') ? 'TEXT TO SKIN' : (item.mode === 'aigc_image_to_skin' || (item.mode as any) === 'image') ? 'IMAGE TO SKIN' : item.mode?.replace('aigc_', '').replaceAll('_', ' ').toUpperCase()}
                                                            </span>


                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-pixel-hans flex items-center gap-2 border ${item.is_public ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                                                <Icon icon={item.is_public ? "pixelarticons:earth" : "pixelarticons:lock"} />
                                                                {item.is_public ? "PUBLIC" : "PRIVATE"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Scrollable Content */}
                                            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24 lg:pb-3 flex flex-col gap-3 min-h-0">

                                                {/* Flow Display */}
                                                {isLoggedIn && <div className="bg-white/5 border border-white/10 p-2.5 w-full flex flex-col gap-2.5">
                                                    {renderEditableName('Name', item.name || '')}

                                                    {(!item.id || item.mode === 'human_edit' || item.mode === 'human_upload') ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-start gap-2">
                                                                <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest flex-shrink-0 w-[75px]">Skin</div>
                                                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                                    <div className="w-[180px] h-[180px] bg-black/40 border border-white/10 overflow-hidden relative">
                                                                        <Skin2DImg src={textureUrl} className="w-full h-full object-contain" />
                                                                    </div>
                                                                    <button
                                                                        onClick={async () => {
                                                                            try {
                                                                                const canvas = await Skin2D(textureUrl);
                                                                                handleEditImage(canvas.toDataURL(), 'intermediate');
                                                                            } catch (e) {
                                                                                console.error("Failed to render 2D image for edit", e);
                                                                            }
                                                                        }}
                                                                        className="bg-[#3c8527] hover:bg-[#4ea632] text-white px-2 py-1.5 border border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:translate-y-0.5 w-[180px] transition-colors"
                                                                        title="AI Edit"
                                                                    >
                                                                        <Icon icon="pixelarticons:robot" className="text-[12px]" />
                                                                        <span className="text-[10px] font-pixel-hans">AI Edit</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (item.mode === 'aigc_text_to_skin') ? (
                                                        <div className="flex flex-col gap-2">
                                                            {item.prompt && (
                                                                <div>
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-1">Prompt</div>
                                                                    <p className="text-white/90 font-pixel-hans text-xs leading-snug break-words whitespace-pre-wrap italic">"{item.prompt}"</p>
                                                                </div>
                                                            )}
                                                            {item.edited_image_url && (
                                                                <div className="flex items-start gap-2">
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest flex-shrink-0 w-[75px]">Intermediate</div>
                                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                                        <div className="w-[180px] h-[180px] bg-black/40 border border-white/10 overflow-hidden relative">
                                                                            <img
                                                                                src={item.edited_image_url}
                                                                                className="w-full h-full object-contain"
                                                                                style={{ imageRendering: 'pixelated' }}
                                                                                alt="Intermediate"
                                                                            />
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleEditImage(item.edited_image_url, 'intermediate')}
                                                                            className="bg-[#3c8527] hover:bg-[#4ea632] text-white px-2 py-1.5 border border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:translate-y-0.5 w-[180px] transition-colors"
                                                                            title="AI Edit"
                                                                        >
                                                                            <Icon icon="pixelarticons:robot" className="text-[12px]" />
                                                                            <span className="text-[10px] font-pixel-hans">AI Edit</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (item.mode === 'aigc_image_to_skin') ? (
                                                        <div className="flex flex-col gap-2">
                                                            {item.source && (
                                                                <div className="flex items-start gap-2">
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest flex-shrink-0 w-[75px]">Source</div>
                                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                                        <div className="w-[180px] h-[180px] bg-black/40 border border-white/10 overflow-hidden relative">
                                                                            <img
                                                                                src={item.source}
                                                                                className="w-full h-full object-contain"
                                                                                style={{ imageRendering: 'pixelated' }}
                                                                                alt="Source"
                                                                            />
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleEditImage(item.source, 'source')}
                                                                            className="bg-[#3c8527] hover:bg-[#4ea632] text-white px-2 py-1.5 border border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:translate-y-0.5 w-[180px] transition-colors"
                                                                            title="AI Edit"
                                                                        >
                                                                            <Icon icon="pixelarticons:robot" className="text-[12px]" />
                                                                            <span className="text-[10px] font-pixel-hans">AI Edit</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2.5">
                                                            {item.source && (
                                                                <div className="flex items-start gap-2">
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest flex-shrink-0 w-[75px]">Source</div>
                                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                                        <div className="w-[180px] h-[180px] bg-black/40 border border-white/10 overflow-hidden relative">
                                                                            <img
                                                                                src={item.source}
                                                                                className="w-full h-full object-contain"
                                                                                style={{ imageRendering: 'pixelated' }}
                                                                                alt="Source"
                                                                            />
                                                                        </div>
                                                                        {(item.mode === "aigc_image_edit_to_skin") && (
                                                                            <button
                                                                                onClick={() => handleEditImage(item.source, "source")}
                                                                                className="bg-[#3c8527] hover:bg-[#4ea632] text-white px-2 py-1.5 border border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:translate-y-0.5 w-[180px] transition-colors"
                                                                                title="AI Edit"
                                                                            >
                                                                                <Icon icon="pixelarticons:robot" className="text-[12px]" />
                                                                                <span className="text-[10px] font-pixel-hans">AI Edit</span>
                                                                            </button>)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {item.prompt && (
                                                                <div>
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-1">Prompt</div>
                                                                    <p className="text-white/90 font-pixel-hans text-xs leading-snug break-words whitespace-pre-wrap italic">"{item.prompt}"</p>
                                                                </div>
                                                            )}
                                                            {item.edited_image_url && (
                                                                <div className="flex items-start gap-2">
                                                                    <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest flex-shrink-0 w-[75px]">Intermediate</div>
                                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                                        <div className="w-[180px] h-[180px] bg-black/40 border border-white/10 overflow-hidden relative">
                                                                            <img
                                                                                src={item.edited_image_url}
                                                                                className="w-full h-full object-contain"
                                                                                style={{ imageRendering: 'pixelated' }}
                                                                                alt="Intermediate"
                                                                            />
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleEditImage(item.edited_image_url, "intermediate")}
                                                                            className="bg-[#3c8527] hover:bg-[#4ea632] text-white px-2 py-1.5 border border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:translate-y-0.5 w-[180px] transition-colors"
                                                                            title="AI Edit"
                                                                        >
                                                                            <Icon icon="pixelarticons:robot" className="text-[12px]" />
                                                                            <span className="text-[10px] font-pixel-hans">AI Edit</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                }

                                                {isLoggedIn ? (
                                                    <>
                                                        {item.id && (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="grid grid-cols-1 gap-2">
                                                                    {/* Artist Card */}
                                                                    <div
                                                                        onClick={() => toggleSidebar('author')}
                                                                        className={`flex items-center gap-2 p-2 border cursor-pointer transition-all group ${showSidebar && sidebarType === 'author' ? 'bg-[#4ea632]/5 border-[#4ea632]/30' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`}
                                                                    >
                                                                        <div className="w-8 h-8 bg-[#222] rounded-full flex items-center justify-center border border-white/10 overflow-hidden group-hover:border-[#4ea632]/40 transition-colors shrink-0">
                                                                            <Icon icon="pixelarticons:user" className="text-lg text-white/40 group-hover:text-[#4ea632] transition-colors" />
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-0.5">Author</div>
                                                                            <div className="text-sm font-pixel-hans text-white/90 group-hover:text-[#4ea632] transition-colors truncate">{item.creator?.username || "Unknown"}</div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Containing Collections Card */}
                                                                    <div
                                                                        onClick={() => toggleSidebar('containing')}
                                                                        className={`flex items-center gap-2 p-2 border cursor-pointer transition-all group ${showSidebar && sidebarType === 'containing' ? 'bg-[#4ea632]/5 border-[#4ea632]/30' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`}
                                                                    >
                                                                        <div className="w-8 h-8 bg-[#222] flex items-center justify-center border border-white/10 overflow-hidden group-hover:border-[#4ea632]/40 transition-colors shrink-0">
                                                                            <Icon icon="pixelarticons:folder" className="text-lg text-white/40 group-hover:text-[#4ea632] transition-colors" />
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-0.5">Found In</div>
                                                                            <div className="text-sm font-pixel-hans text-white/90 group-hover:text-[#4ea632] transition-colors truncate">{current.mcmodal.relatedCollections}</div>
                                                                        </div>
                                                                        {relatedCollectionsCount !== null && (
                                                                            <span className="text-[10px] text-white/40 font-pixel-hans group-hover:text-[#4ea632] transition-colors shrink-0 pr-1">
                                                                                {relatedCollectionsCount}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className={`grid gap-2 ${(parentItem || isParentDeleted) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                                    {parentItem && (
                                                                        <div
                                                                            onClick={() => handleItemSelect(item.parent!)}
                                                                            className="flex items-center gap-2 p-2 border cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                                                                        >
                                                                            <div className="w-8 h-8 bg-[#222] flex items-center justify-center border border-white/10 overflow-hidden group-hover:border-[#4ea632]/40 transition-colors shrink-0">
                                                                                {parentItem.result ? (
                                                                                    <Skin2DImg src={parentItem.result}
                                                                                        className="w-full h-full object-contain"
                                                                                    />
                                                                                ) : (
                                                                                    <Icon icon="pixelarticons:history" className="text-lg text-white/40 group-hover:text-[#4ea632] transition-colors" />
                                                                                )}
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-0.5">Derived From</div>
                                                                                <div className="text-sm font-pixel-hans text-white/90 group-hover:text-[#4ea632] transition-colors truncate">{parentItem.name || parentItem.id}</div>
                                                                                {parentItem.creator?.username && (
                                                                                    <div className="text-white/40 text-[10px] font-pixel-hans mt-0.5">by {parentItem.creator.username}</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {isParentDeleted && (
                                                                        <div className="flex items-center gap-2 p-2 border bg-red-500/5 border-red-500/20 text-red-500 flex-1">
                                                                            <div className="w-8 h-8 bg-[#222] flex items-center justify-center border border-white/10 overflow-hidden shrink-0">
                                                                                <Icon icon="pixelarticons:warning-box" className="text-lg text-red-400" />
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-0.5">Derived From</div>
                                                                                <div className="text-xs font-pixel-hans">{current.mcmodal.originalSkinDeleted}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div
                                                                        onClick={() => toggleSidebar('derived')}
                                                                        className={`flex items-center gap-2 p-2 border cursor-pointer transition-all group ${showSidebar && sidebarType === 'derived' ? 'bg-[#4ea632]/5 border-[#4ea632]/30' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`}
                                                                    >
                                                                        <div className="w-8 h-8 bg-[#222] flex items-center justify-center border border-white/10 overflow-hidden group-hover:border-[#4ea632]/40 transition-colors shrink-0">
                                                                            <Icon icon="pixelarticons:git-merge" className="text-lg text-white/40 group-hover:text-[#4ea632] transition-colors" />
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-white/30 text-[9px] font-pixel-hans uppercase tracking-widest mb-0.5">Derived</div>
                                                                            <div className="text-sm font-pixel-hans text-white/90 group-hover:text-[#4ea632] transition-colors truncate">{current.mcmodal.allDerived}</div>
                                                                        </div>
                                                                        {derivedCount !== null && (
                                                                            <span className="text-[10px] text-white/40 font-pixel-hans group-hover:text-[#4ea632] transition-colors shrink-0 pr-1">
                                                                                {derivedCount}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-auto w-full border-t border-dashed border-white/10 pt-1.5 flex flex-col gap-1">
                                                            {item.model_version && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:sliders" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">Model</span>
                                                                    </div>
                                                                    <div className="text-purple-400">{item.model_version.toUpperCase()}</div>
                                                                </div>
                                                            )}
                                                            {item.seed !== undefined && item.seed !== null && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:sliders" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">Seed</span>
                                                                    </div>
                                                                    <div className="text-white/40">{item.seed}</div>
                                                                </div>
                                                            )}
                                                            {item.guidance !== undefined && item.guidance !== null && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:sliders" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">Guidance</span>
                                                                    </div>
                                                                    <div className="text-white/40">{item.guidance}</div>
                                                                </div>
                                                            )}
                                                            {item.n_step !== undefined && item.n_step !== null && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:sliders" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">Steps</span>
                                                                    </div>
                                                                    <div className="text-white/40">{item.n_step}</div>
                                                                </div>
                                                            )}
                                                            {item.id && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:sliders" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">ID</span>
                                                                    </div>
                                                                    <div className="text-white/40" title={item.id}>{item.id.toString()}</div>
                                                                </div>
                                                            )}
                                                            {item.timestamp && (
                                                                <div className="flex justify-between items-center text-white/30 text-[9px] font-pixel-hans">
                                                                    <div className="flex items-center gap-1">
                                                                        <Icon icon="pixelarticons:clock" className="text-[10px] text-white/20" />
                                                                        <span className="uppercase tracking-widest text-white/40">Created</span>
                                                                    </div>
                                                                    <div className="text-white/40">{formatDate(item.timestamp)}</div>
                                                                </div>
                                                            )}

                                                            {currentUser && item.result && item.is_public === true && (
                                                                <div className="flex flex-col gap-1.5 mt-2">
                                                                    <button
                                                                        type="button"
                                                                        disabled={isSettingSkin}
                                                                        onClick={handleSetMinecraftSkin}
                                                                        className="w-full py-2 bg-[#4ea632]/20 hover:bg-[#4ea632]/30 active:bg-[#4ea632]/40 border border-[#4ea632]/40 hover:border-[#4ea632]/60 text-[#4ea632] text-xs font-bold font-pixel-hans transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                                                                    >
                                                                        {isSettingSkin ? (
                                                                            <>
                                                                                <Icon icon="pixelarticons:reload" className="text-sm shrink-0 animate-spin" />
                                                                                <span>{current.mcmodal.settingMyCharacter}</span>
                                                                            </>
                                                                        ) : skinSuccess ? (
                                                                            <>
                                                                                <Icon icon="pixelarticons:check" className="text-sm shrink-0" />
                                                                                <span>{current.mcmodal.setMyCharacterSuccess}</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Icon icon="pixelarticons:user animate-pulse" className="text-sm shrink-0" />
                                                                                <span>{current.mcmodal.setMyCharacter}</span>
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                    {skinError && (
                                                                        <span className="text-[10px] text-red-400 font-pixel-hans leading-tight block text-center">
                                                                            {skinError}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {item.id && item.mode && item.mode.startsWith('aigc_') && item.is_public === true && !hasUserFeedback && (
                                                                <div className="p-3 bg-white/5 border border-white/10 flex flex-col gap-2 mt-2">
                                                                    <div className="text-white/40 text-[10px] font-pixel-hans uppercase tracking-widest">
                                                                        {current.mcmodal.feedbackTitle}
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <button
                                                                            onClick={() => handleQualityFeedback(true)}
                                                                            className="flex items-center justify-center gap-1.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-pixel-hans cursor-pointer transition-colors active:translate-y-0.5"
                                                                        >
                                                                            <Icon icon="pixelarticons:check" className="text-[12px]" />
                                                                            <span>{current.mcmodal.feedbackGood}</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleQualityFeedback(false)}
                                                                            className="flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-pixel-hans cursor-pointer transition-colors active:translate-y-0.5"
                                                                        >
                                                                            <Icon icon="pixelarticons:close" className="text-[12px]" />
                                                                            <span>{current.mcmodal.feedbackBad}</span>
                                                                        </button>
                                                                    </div>

                                                                    <div className="text-xs font-pixel-hans text-white/40 leading-relaxed border-t border-white/5 pt-2 mt-1">
                                                                        <span>{current.mcmodal.discordPrompt}</span>
                                                                        <a
                                                                            href="https://discord.gg/ByX7TwqDcw"
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-[#5865F2] hover:underline inline-flex items-center gap-0.5 shrink-0"
                                                                        >
                                                                            <Icon icon="pixelarticons:message-text" className="text-xs" />
                                                                            <span>{current.mcmodal.discordLinkText}</span>
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {item.id && (
                                                                <div className="flex justify-end gap-3 text-white/25 text-[9px] font-pixel-hans mt-0.5 pt-1 border-t border-white/5">
                                                                    <button ref={reportButtonRef} onClick={handleReport} className={`hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer ${isReportOpen ? 'text-orange-400' : ''}`}>
                                                                        <Icon icon="pixelarticons:warning-box" className="text-[11px]" />
                                                                        <span>Report</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                                                        <Icon icon="pixelarticons:lock" className="text-5xl text-white/10 animate-pulse" />
                                                        <p className="font-pixel-hans text-xs text-white/50 leading-relaxed">
                                                            {current.mcmodal.loginToSeeMore}
                                                        </p>
                                                        <GoogleSignInButton
                                                            onSuccess={handleGoogleSuccess}
                                                            onError={() => console.error('Google login error')}
                                                        />
                                                    </div>
                                                )}
                                            </div> {/* Scrollable Content End */}

                                            {/* Actions */}
                                            <div className={`flex flex-col gap-2 p-4 pt-1 sticky bottom-0 bg-[#121212] lg:relative z-20 border-t border-white/10 lg:border-t-0 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] lg:shadow-none ${(!isLoggedIn || !item.id) ? 'hidden lg:flex' : ''}`}>
                                                {/* Collection Dropdown */}
                                                <AnimatePresence>
                                                    {isDropdownOpen && (
                                                        <MCModalDropdown
                                                            myCollections={myCollections}
                                                            mySelectedIds={mySelectedIds}
                                                            activeTab={activeTab}
                                                            isLoadingMyCollections={isLoadingMyCollections}
                                                            isSavingMyCollections={isSavingMyCollections}
                                                            newCollectionName={newCollectionName}
                                                            setNewCollectionName={setNewCollectionName}
                                                            setActiveTab={setActiveTab}
                                                            handleToggleMyCollection={handleToggleMyCollection}
                                                            handleCreateCollection={handleCreateCollection}
                                                            handleSaveMyCollection={handleSaveMyCollection}
                                                            isItemPublic={item?.is_public === true}
                                                            hasMore={myColPage < myColTotalPages}
                                                            onLoadMore={() => fetchMyCollections(myColPage + 1)}
                                                            current={current}
                                                        />
                                                    )}
                                                </AnimatePresence>

                                                {/* Report Dropdown */}
                                                <AnimatePresence>
                                                    {isReportOpen && (
                                                        <motion.div
                                                            ref={reportRef}
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="absolute bottom-full mb-3 right-0 w-[240px] bg-[#0a0a0a] border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.8)] z-50 flex flex-col pointer-events-auto overflow-hidden"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div className="p-3 border-b border-white/5 font-pixel-hans text-[11px] text-white/60">
                                                                {current.mcmodal.reportTitle}
                                                            </div>
                                                            {isReportSubmitted ? (
                                                                <div className="p-4 text-center text-[#4ea632] text-[11px] font-pixel-hans flex items-center justify-center gap-1">
                                                                    <Icon icon="pixelarticons:check" />
                                                                    {current.mcmodal.reportSuccess}
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col p-1 gap-0.5">
                                                                    {(current.mcmodal.reasons as string[]).map((reason: string) => (
                                                                        <div
                                                                            key={reason}
                                                                            onClick={() => submitReport(reason)}
                                                                            className="p-2 hover:bg-white/5 cursor-pointer rounded transition-colors text-white/80 font-pixel-hans text-xs flex items-center justify-between group"
                                                                        >
                                                                            <span>{reason}</span>
                                                                            <Icon icon="pixelarticons:chevron-right" className="text-xs opacity-0 group-hover:opacity-40" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {isLoggedIn && (
                                                    <div className="flex gap-2">
                                                        {item.id && item.is_public === true && (
                                                            <button
                                                                onClick={handleLike}
                                                                className={`flex-1 px-4 py-2 border-b-4 font-pixel-hans text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:border-b-0 active:translate-y-1 group relative overflow-hidden ${isLiked
                                                                    ? 'bg-red-500 hover:bg-red-600 text-white border-red-700 shadow-[0_4px_12px_rgba(239,68,68,0.2)]'
                                                                    : 'bg-[#1a1a1a] text-red-500 hover:bg-[#222222] border-white/10'
                                                                    }`}
                                                            >
                                                                <motion.div
                                                                    key={isLiked ? 'liked' : 'unliked'}
                                                                    initial={{ scale: 0.8 }}
                                                                    animate={{ scale: [0.8, 1.3, 1] }}
                                                                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                                                                    className="flex items-center"
                                                                >
                                                                    <Icon icon="pixelarticons:heart" className="text-xl" />
                                                                </motion.div>
                                                                <span className={`text-[13px] font-pixel-hans ${isLiked ? 'text-white' : 'text-red-500'}`}>{likesCount}</span>
                                                            </button>
                                                        )}

                                                        {item.id && (
                                                            <button
                                                                onClick={() => {
                                                                    setIsReportOpen(false);
                                                                    setIsDropdownOpen(prev => !prev);
                                                                }}
                                                                className={`flex-1 px-4 py-2 border-b-4 font-pixel-hans text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:border-b-0 active:translate-y-1 ${isFavorited || isDropdownOpen
                                                                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-700'
                                                                    : 'bg-[#1a1a1a] text-yellow-500 hover:bg-[#222222] border-white/10'
                                                                    }`}
                                                                title={current.mcmodal.favorite}
                                                            >
                                                                <Icon icon={isFavorited ? "pixelarticons:bookmark" : "pixelarticons:bookmark"} className="text-lg" />
                                                            </button>
                                                        )}
                                                        {item.id && item.is_public === true && (
                                                            <button
                                                                onClick={handleShare}
                                                                className="flex-1 px-4 py-2 border-b-4 font-pixel-hans text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:border-b-0 active:translate-y-1 bg-[#1a1a1a] text-[#4ea632] hover:bg-[#222222] border-white/10"
                                                                title={current.mcmodal.share}
                                                            >
                                                                <Icon icon="pixelarticons:forward" className="text-lg" />
                                                            </button>
                                                        )}


                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}


                                </>
                            )}

                            <button
                                onClick={closeModal}
                                className={`absolute top-2 right-2 z-20 text-white/40 hover:text-white transition-all cursor-pointer bg-white/5 hover:bg-white/10 p-2 rounded-full border border-white/5 ${showSidebar ? 'hidden lg:flex' : 'flex'}`}
                            >
                                <Icon icon="pixelarticons:close" className="text-xl" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}

function MCModalPreviewPlaceholder() {
    return (
        <div className="w-full lg:w-[600px] aspect-square lg:h-[720px] [@media(max-height:850px)]:lg:h-full [@media(max-height:850px)]:lg:aspect-square bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] relative overflow-hidden flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 flex items-center justify-center">
            <LoadingSpinner className="w-8 h-8 border-4" />
        </div>
    );
}
