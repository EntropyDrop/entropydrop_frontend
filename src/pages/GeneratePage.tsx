import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate, useLocation } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { Skin2D } from '../components/utils'
import { LoadingSpinner } from '../components/LoadingPlaceholder'
// import { MC } removed
import { AnimatePresence } from 'framer-motion'
import { MCModal } from '../components/MCModal'
import { ConfirmModal } from '../components/ConfirmModal'
import type { GenerationLogItem } from '../types/log'
import { showError } from '../utils/alert'
import { apiFetch } from '../utils/api'
import { formatDate } from '../utils/date'


interface GeneratePageProps {
    current: LangData
}

const max_seed = 100000000;
type GenMode = 'aigc_image_to_skin' | 'aigc_text_to_skin' | 'aigc_image_edit_to_skin'
export function GeneratePage({ current }: GeneratePageProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const [genMode, setGenMode] = useState<GenMode>('aigc_image_to_skin')
    const [modelVersion, setModelVersion] = useState<string>('unknown')
    const [isGenerating, setIsGenerating] = useState(false)
    const [isPrivate, setIsPrivate] = useState(false)
    const [isPro, setIsPro] = useState(false)
    // showResult state removed
    const [prompt, setPrompt] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

    const [history, setHistory] = useState<GenerationLogItem[]>([])
    const [totalPages, setTotalPages] = useState(0)
    const [selectedHistory, setSelectedHistory] = useState<GenerationLogItem>()
    const [seed, setSeed] = useState<number | undefined>(() => Math.floor(Math.random() * max_seed))
    const [nStep, setNStep] = useState<number | undefined>(100)
    const [guidance, setGuidance] = useState<number | undefined>(4)
    const [sourceId, setSourceId] = useState<string | null>(null)
    const [editSourceType, setEditSourceType] = useState<'source' | 'intermediate' | null>(null)
    // editedImage state removed
    const [isSourcePrivate, setIsSourcePrivate] = useState(false)
    const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null)
    const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null)
    const [unlimitedQuota, setUnlimitedQuota] = useState(false)
    const [isAigcSkinEnabled, setIsAigcSkinEnabled] = useState(true)
    const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; message: string; type?: 'info' | 'error' | 'success' }>({ isOpen: false, title: '', message: '' })
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)

    useEffect(() => {
        const loadStateImage = async () => {
            if (location.state?.sourceImage && location.state?.mode === 'aigc_image_edit_to_skin') {
                setGenMode('aigc_image_edit_to_skin');
                setSourceId(location.state.sourceId || null);
                setEditSourceType(location.state.sourceType || null);
                setImagePreviewUrl(location.state.sourceImage);
                if (location.state.isPublic === false) {
                    setIsPrivate(true);
                    setIsSourcePrivate(true);
                }
                try {
                    const res = await fetch(location.state.sourceImage);
                    const blob = await res.blob();
                    const filename = location.state.sourceImage.split('/').pop() || 'source.jpg';

                    const img = new Image();
                    const url = URL.createObjectURL(blob);
                    await new Promise<void>((resolve, reject) => {
                        img.onload = async () => {
                            // Check if it is a Minecraft skin layout file (64x64 or 64x32)
                            if (img.width === 64 && (img.height === 64 || img.height === 32)) {
                                try {
                                    const skinCanvas = await Skin2D(url);
                                    const canvas = document.createElement('canvas');
                                    canvas.width = 768;
                                    canvas.height = 768;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        ctx.fillStyle = '#FFFFFF';
                                        ctx.fillRect(0, 0, 768, 768);
                                        ctx.drawImage(skinCanvas, 0, 0, 768, 768);

                                        canvas.toBlob((resizedBlob) => {
                                            if (resizedBlob) {
                                                const newName = filename.replace(/\.[^/.]+$/, "") + "_rendered.jpg";
                                                const resizedFile = new File([resizedBlob], newName, { type: 'image/jpeg' });
                                                setImageFile(resizedFile);
                                                setImagePreviewUrl(canvas.toDataURL('image/jpeg', 0.82));
                                            }
                                            resolve();
                                        }, 'image/jpeg', 0.82);
                                    } else {
                                        reject(new Error('Failed to get 2D context'));
                                    }
                                } catch (err) {
                                    reject(err);
                                }
                                return;
                            }

                            // Normal image load logic
                            const canvas = document.createElement('canvas');
                            canvas.width = 768;
                            canvas.height = 768;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                // Fill white background
                                ctx.fillStyle = '#FFFFFF';
                                ctx.fillRect(0, 0, 768, 768);

                                // Calculate aspect ratio
                                const scale = Math.min(768 / img.width, 768 / img.height);
                                const x = (768 - img.width * scale) / 2;
                                const y = (768 - img.height * scale) / 2;
                                const drawWidth = img.width * scale;
                                const drawHeight = img.height * scale;

                                ctx.drawImage(img, x, y, drawWidth, drawHeight);

                                canvas.toBlob((resizedBlob) => {
                                    if (resizedBlob) {
                                        const newName = filename.replace(/\.[^/.]+$/, "") + ".jpg";
                                        const resizedFile = new File([resizedBlob], newName, { type: 'image/jpeg' });
                                        setImageFile(resizedFile);
                                        setImagePreviewUrl(canvas.toDataURL('image/jpeg', 0.82));
                                    }
                                    resolve();
                                }, 'image/jpeg', 0.82);
                            } else {
                                reject(new Error('Failed to get 2D context'));
                            }
                        };
                        img.onerror = (err) => reject(err);
                        img.src = url;
                    }).finally(() => {
                        URL.revokeObjectURL(url);
                    });
                } catch (e) {
                    console.error('Failed to load and resize state image into File', e);
                }
            }
        };
        loadStateImage();
    }, [location.state]);

    const [modelsConfig, setModelsConfig] = useState<Record<string, string[]>>({})

    const fetchModels = async () => {
        try {
            const response = await apiFetch('/api/models')
            if (response.ok) {
                const data = await response.json()
                setModelsConfig(data)
                // Set initial model version based on current genMode
                const currentMode = genMode
                if (data[currentMode] && data[currentMode].length > 0) {
                    setModelVersion(data[currentMode][0])
                }
            }
        } catch (e) {
            console.error('Failed to fetch models', e)
        }
    }


    useEffect(() => {
        if (localStorage.getItem('token')) {
            fetchModels()
            fetchUserStatus()
        }
    }, [])

    const fetchUserStatus = async () => {
        try {
            const res = await apiFetch('/api/users/me')
            if (res.ok) {
                const data = await res.json()
                setIsPro(data.is_pro)
                setUnlimitedQuota(!!data.unlimited_quota)
                setIsAigcSkinEnabled(data.aigc_skin_enabled !== false)
                if (data.daily_generation_limit !== undefined) {
                    setQuota({
                        remaining: data.remaining_generation_quota,
                        limit: data.daily_generation_limit
                    })
                }
            }
        } catch (e) {
            console.error('Failed to fetch user status', e)
        }
    }

    useEffect(() => {
        const currentMode = genMode
        if (modelsConfig[currentMode] && modelsConfig[currentMode].length > 0) {
            setModelVersion(modelsConfig[currentMode][0])
        } else {
            setModelVersion('unknown')
        }
    }, [genMode, modelsConfig])

    // Pagination state

    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 6

    const fetchHistory = async (page: number) => {
        if (isHistoryLoading) return
        setIsHistoryLoading(true)
        try {
            const response = await apiFetch(`/api/history?page=${page}&page_size=${itemsPerPage}`)
            if (response.ok) {
                const data = await response.json()
                const mappedItems = data.items.map((item: GenerationLogItem) => {
                    const existing = history.find(p => p.id === item.id)
                    item.result_render_2d = existing?.result_render_2d || ''
                    return item
                })

                setHistory(mappedItems)
                setTotalPages(data.total_pages)
                setCurrentPage(data.page)

                mappedItems.forEach(async (item: GenerationLogItem) => {
                    if (item.status && item.status !== 'success') return; // Skip if processing or pending
                    if (item.result_render_2d) return; // Skip if already loaded
                    if (!item.result) return;
                    try {
                        const render = (await Skin2D(item.result)).toDataURL('image/png')
                        setHistory(prev => prev.map(p => p.id === item.id ? { ...p, result_render_2d: render } : p))
                    } catch (e) {
                        console.error('Failed to render 2D skin for item:', item.id, e)
                    }
                })
            } else {
                const errorData = await response.json().catch(() => ({ detail: `Error: ${response.status}` }))
                console.error('History API error:', errorData)
            }
        } catch (e) {
            console.error('Failed to fetch history', e)
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        if (localStorage.getItem('token')) {
            fetchHistory(currentPage)
        }
    }, [currentPage])

    useEffect(() => {
        const hasActive = history.some(item => ['pending', 'processing', 'pending_skin', 'processing_skin'].includes(item.status || ''))
        if (hasActive && localStorage.getItem('token')) {
            const timer = setInterval(() => {
                fetchHistory(currentPage)
            }, 3000)
            return () => clearInterval(timer)
        }
    }, [history, currentPage])

    useEffect(() => {
        if (lastSubmittedId && history.length > 0) {
            const item = history.find(i => i.id === lastSubmittedId)
            if (item && item.status === 'success') {

                // setEditedImage and setShowResult removed
                setSelectedHistory(item)
                setLastSubmittedId(null) // Reset
                // Trigger auto save if needed, handleSave is simple (removed)

            } else if (item && item.status === 'failed') {
                setLastSubmittedId(null)
                showError(current.generate.generationFailed + (item.error_msg || 'Unknown Error'))
            }

        }
    }, [history, lastSubmittedId])

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isGenerating) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [isGenerating])

    const handleGenerate = async () => {
        if (isGenerating || modelVersion === 'unknown' || !modelVersion) return

        if (!isAigcSkinEnabled && (genMode === 'aigc_text_to_skin' || genMode === 'aigc_image_edit_to_skin')) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.lang === 'zh-hans' ? '该功能暂不可用，请稍后再试。' : 'This feature is temporarily unavailable.', type: 'info' })
            return
        }

        if ((genMode === 'aigc_image_to_skin' || genMode === 'aigc_image_edit_to_skin') && !imageFile) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.generate.pleaseUploadImage, type: 'info' })
            return
        }

        if ((genMode === 'aigc_text_to_skin' || genMode === 'aigc_image_edit_to_skin') && !prompt.trim()) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.generate.pleaseEnterDesc, type: 'info' })
            return
        }

        if (guidance !== undefined && (guidance < 0.1 || guidance > 15)) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.generate.guidanceWarning, type: 'info' })
            return
        }

        if (nStep !== undefined && (nStep < 20 || nStep > 120)) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.generate.stepsWarning, type: 'info' })
            return
        }
        if (seed !== undefined && (seed < 0 || seed > max_seed)) {
            setInfoModal({ isOpen: true, title: current.generate.notice, message: current.generate.seedWarning, type: 'info' })
            return
        }

        const newSeed = Math.floor(Math.random() * max_seed)
        setSeed(newSeed)

        setIsGenerating(true)
        // setShowResult removed



        try {
            const formData = new FormData()
            if (genMode === 'aigc_image_to_skin' || genMode === 'aigc_image_edit_to_skin') {
                formData.append('file', imageFile!)
            }
            if (prompt) {
                formData.append('prompt', prompt)
            }
            formData.append('mode', genMode)
            formData.append('is_public', String(!isPrivate))
            if (sourceId) {
                formData.append('parent', sourceId)
            }
            if (editSourceType) {
                formData.append('edit_source_type', editSourceType)
            }
            formData.append('model_version', modelVersion)
            formData.append('seed', String(newSeed))
            if (nStep !== undefined) formData.append('n_step', String(nStep))
            if (guidance !== undefined) formData.append('guidance', String(guidance))

            const response = await apiFetch("/api/generate", {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `${current.generate.serverError}: ${response.status}` }))
                throw new Error(errorData.detail || `${current.generate.serverError}: ${response.status}`)
            }

            const data = await response.json()
            const logId = data.id

            if (!logId) {
                throw new Error(current.generate.failedGetTaskId)
            }

            setLastSubmittedId(logId)
            setIsGenerating(false) // Unlock immediately
            if (currentPage === 1) {
                fetchHistory(1) // Refresh immediately
            } else {
                setCurrentPage(1) // Switching to page 1 will trigger fetchHistory(1) automatically via useEffect
            }
            fetchUserStatus() // Refresh quota
            //setInfoModal({ isOpen: true, title: current.generate.submitSuccess, message: current.generate.submitSuccessMsg, type: 'success' })

        } catch (e: any) {
            console.error(e)
            // setInfoModal({ isOpen: true, title: current.generate.submitFailed, message: current.generate.submitFailedMsg + e.message, type: 'error' })
            setIsGenerating(false)
        }
    }

    const selectHistory = (item: any) => {
        if (['pending', 'processing', 'pending_skin', 'processing_skin'].includes(item.status)) return
        if (item.status === 'failed') {
            showError(current.generate.generationFailed + (item.error_msg || 'Unknown Error'))
            return
        }
        setSelectedHistory(item)
    }


    const handleModeChange = (mode: GenMode) => {
        if (genMode !== mode) {
            setGenMode(mode)
            setPrompt('')
            setImageFile(null)
            setImagePreviewUrl(null)
            setSourceId(null)
            setEditSourceType(null)
            setSelectedHistory(undefined)

            setSeed(Math.floor(Math.random() * max_seed))
            setNStep(100)
            setGuidance(4)
            setIsSourcePrivate(false)
            setIsPrivate(false)

            if (location.state) {
                navigate(location.pathname, { replace: true, state: {} });
            }
        }
    }



    if (!localStorage.getItem('token')) {
        return (
            <PageContainer
                alignItems="items-start lg:items-center"
                height="h-auto lg:h-full"
                overflow="overflow-visible lg:overflow-hidden"
                animate="animate-in fade-in zoom-in duration-300"
                className="items-center justify-center"
            >
                    <Icon icon="pixelarticons:lock" className="text-6xl opacity-30" />
                    <div className="text-center flex flex-col gap-1">
                        <h2 className={`text-xl font-bold ${current.fontClass}`}>
                            {current.common.authRequired}
                        </h2>
                        <p className={`text-white/60 text-xs ${current.fontClass}`}>
                            {current.generate.loginPrompt}
                        </p>
                    </div>
            </PageContainer>
        )
    }

    const activeTasks = history.filter(item => ['pending', 'processing', 'pending_skin', 'processing_skin'].includes(item.status || ''))
    const completedHistory = history.filter(item => !['pending', 'processing', 'pending_skin', 'processing_skin'].includes(item.status || ''))

    return (
        <PageContainer
            alignItems="items-start lg:items-center"
            height="h-auto lg:h-full"
            gap="gap-3 lg:gap-6"
            overflow="overflow-visible lg:overflow-hidden"
            animate="animate-in fade-in zoom-in duration-300"
            className="flex-col lg:flex-row"
        >

                {/* Left: History Sidebar */}
                <div className="w-full lg:w-80 flex flex-col gap-4 order-last lg:order-first border-t lg:border-t-0 lg:border-r border-white/10 pt-4 lg:pt-0 lg:pr-6 shrink-0 h-auto lg:h-full">
                    <h3 className={`text-white text-sm lg:text-lg m-0 flex items-center gap-2 opacity-80 lg:opacity-100 ${current.fontClass}`}>
                        <Icon icon="pixelarticons:book-open" /> {current.generate.historyTitle}
                    </h3>

                    <div className="flex flex-col gap-3 pb-2 custom-scrollbar lg:flex-1 overflow-y-auto">
                        {history.length === 0 ? (
                            <div className="text-white flex flex-col items-center justify-center h-24 lg:h-full w-full opacity-20 text-[10px] gap-2 shrink-0">
                                <Icon icon="pixelarticons:notes-delete" className="text-xl lg:text-2xl" />
                                <span className={current.fontClass}>{current.generate.historyEmpty}</span>
                            </div>
                        ) : (
                            <>
                                {/* 1. Active Task Queue Dashboard */}
                                {activeTasks.length > 0 && (
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <h4 className={`text-[10px] text-[#a6df7a] m-0 uppercase tracking-wider flex items-center gap-1.5 font-bold ${current.fontClass}`}>
                                            <span className="w-1.5 h-1.5 bg-[#a6df7a] rounded-none animate-ping" />
                                            {current.lang === 'zh-hans' ? '当前构建任务' : 'Active Tasks'}
                                        </h4>
                                        <div className="flex flex-col gap-2">
                                            {activeTasks.map(item => {
                                                let progressPercent = 10;
                                                let phaseText = '';
                                                let isQueueing = false;

                                                if (item.status === 'pending') {
                                                    progressPercent = 10;
                                                    phaseText = current.generate.statusPending;
                                                    isQueueing = true;
                                                } else if (item.status === 'processing') {
                                                    progressPercent = 25;
                                                    phaseText = current.generate.statusProcessing;
                                                } else if (item.status === 'pending_skin') {
                                                    progressPercent = 40;
                                                    phaseText = current.generate.statusPendingSkin;
                                                    isQueueing = true;
                                                } else if (item.status === 'processing_skin') {
                                                    progressPercent = 60;
                                                    phaseText = current.generate.statusProcessingSkin;
                                                }

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="p-3 bg-black/60 border border-[#3c8527]/30 hover:border-[#3c8527]/60 transition-all flex flex-col gap-2 shrink-0 w-full rounded-none animate-pixel-glow"
                                                    >
                                                        {/* Header Row: Icon + Mode & Queue Position */}
                                                        <div className="flex items-start gap-2.5">
                                                            <div className="w-10 h-10 bg-black/40 border border-white/10 flex items-center justify-center shrink-0 text-[#a6df7a]">
                                                                <Icon
                                                                    icon={isQueueing ? "pixelarticons:hourglass" : "pixelarticons:reload"}
                                                                    className={`text-xl ${isQueueing ? 'animate-pixel-blink' : 'animate-spin'}`}
                                                                    style={isQueueing ? {} : { animationDuration: '4s' }}
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <span className={`text-[9px] text-white/50 uppercase truncate ${current.fontClass}`}>
                                                                        {item.mode === 'aigc_image_to_skin' ? 'Image to Skin' : item.mode === 'aigc_image_edit_to_skin' ? 'Image Edit to Skin' : 'Text to Skin'}
                                                                    </span>
                                                                    {item.queue_position && item.queue_position > 0 ? (
                                                                        <span className="shrink-0 px-1 py-0.5 bg-[#a6df7a]/15 text-[#a6df7a] border border-[#a6df7a]/30 text-[8px] font-mono font-bold leading-none uppercase">
                                                                            Q: #{item.queue_position}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="shrink-0 px-1 py-0.5 bg-[#a6df7a]/10 text-[#a6df7a]/85 border border-[#a6df7a]/20 text-[8px] font-mono font-bold leading-none uppercase animate-pulse">
                                                                            Q: READY
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    <span className={`text-[11px] font-bold text-[#a6df7a] truncate ${current.fontClass}`}>
                                                                        {phaseText}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Description Prompt Row */}
                                                        {item.mode !== 'aigc_image_to_skin' && (
                                                            <div className={`text-[9px] text-white/60 truncate italic px-1 ${current.fontClass}`}>
                                                                "{item.prompt || (item.mode === 'aigc_image_edit_to_skin' ? current.generate.imageUploadDesc : current.generate.noPrompt)}"
                                                            </div>
                                                        )}

                                                        {/* Retro Progress Bar */}
                                                        <div className="relative w-full h-3 bg-black/60 border border-white/10 p-[1px] flex items-center">
                                                            <div
                                                                className="h-full bg-[#3c8527] transition-all duration-1000 ease-out relative overflow-hidden flex items-center justify-end pr-1"
                                                                style={{ width: `${progressPercent}%` }}
                                                            >
                                                                <div className="absolute inset-0 animate-retro-stripe opacity-25" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 2. Completed History */}
                                {completedHistory.length > 0 && (
                                    <div className="flex flex-col gap-2 shrink-0">
                                        {activeTasks.length > 0 && (
                                            <h4 className={`text-[10px] text-white/30 m-0 uppercase tracking-wider flex items-center gap-1.5 font-bold mt-2 ${current.fontClass}`}>
                                                <Icon icon="pixelarticons:book-open" className="text-xs" />
                                                {current.lang === 'zh-hans' ? '已完成历史' : 'Completed History'}
                                            </h4>
                                        )}
                                        <div className="flex flex-col gap-3">
                                            {completedHistory.map(item => (
                                                <div
                                                    key={item.id}
                                                    onClick={() => selectHistory(item)}
                                                    className="group p-2 bg-white/5 border border-transparent hover:border-green-500/30 hover:bg-white/10 cursor-pointer transition-all flex gap-3 items-center shrink-0 w-full"
                                                >
                                                    <div className="w-14 h-14 lg:w-20 lg:h-20 bg-black/40 overflow-hidden shrink-0 border border-white/5 flex items-center justify-center">
                                                        {item.status === 'success' || !item.status ? (
                                                            item.result_render_2d ? (
                                                                <img
                                                                    src={item.result_render_2d}
                                                                    className="w-full h-full object-contain p-1"
                                                                    style={{ imageRendering: 'pixelated' }}
                                                                    alt="thumb"
                                                                />
                                                            ) : (
                                                                <LoadingSpinner className="w-3 h-3 border-2" />
                                                            )
                                                        ) : (
                                                            <Icon icon="pixelarticons:close" className="text-red-500 text-lg" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[10px] lg:text-xs text-white/40 truncate flex justify-between">
                                                            <div className="flex items-center gap-1">
                                                                <span>{formatDate(item.timestamp)}</span>
                                                            </div>
                                                            {item.status === 'failed' && <span className="text-red-500/80">{current.generate.statusFailed}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 min-w-0">
                                                            <div className={`flex-1 text-xs lg:text-sm text-white/80 truncate ${current.fontClass}`}>
                                                                {item.prompt || (item.mode === 'aigc_image_to_skin' || item.mode === 'aigc_image_edit_to_skin' ? current.generate.imageUploadDesc : current.generate.noPrompt)}
                                                            </div>
                                                            {item.is_pro && (
                                                                <span className="shrink-0 px-1 bg-yellow-500/20 text-yellow-500 text-[6px] lg:text-[7px] border border-yellow-500/30 flex items-center gap-0.5">
                                                                    <Icon icon="pixelarticons:zap" className="text-[6px]" />
                                                                    {current.generate.proTag}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 shrink-0">
                            <button
                                disabled={currentPage === 1 || isHistoryLoading}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                            >
                                <Icon icon={isHistoryLoading ? "pixelarticons:reload" : "pixelarticons:chevron-left"} className={isHistoryLoading ? "animate-spin" : ""} />
                            </button>
                            <span className={`text-white/40 text-[10px] ${current.fontClass}`}>
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                disabled={currentPage === totalPages || isHistoryLoading}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                className="p-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white border border-white/10 cursor-pointer transition-colors"
                            >
                                <Icon icon={isHistoryLoading ? "pixelarticons:reload" : "pixelarticons:chevron-right"} className={isHistoryLoading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Middle: Input Controls */}
                <div className="flex-1 flex flex-col gap-4 lg:gap-6 lg:h-full min-w-0">
                    <div className="flex flex-col gap-3 lg:gap-4 w-full">
                        <h3 className={`text-white text-xs lg:text-sm m-0 opacity-80 ${current.fontClass}`}>{current.generate.modeLabel}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
                            <button
                                onClick={() => handleModeChange('aigc_image_to_skin')}
                                className={`flex-1 py-3 px-3 flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer border ${genMode === 'aigc_image_to_skin' ? 'bg-[#3c8527]/20 border-[#3c8527] text-white shadow-[0_0_15px_-3px_rgba(60,133,39,0.3)]' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <div key={genMode} className="flex items-center">
                                    <Icon icon="pixelarticons:image" className={`text-lg lg:text-xl ${genMode === 'aigc_image_to_skin' ? 'text-[#a6df7a]' : 'opacity-60'}`} />
                                </div>
                                <span className={`text-[10px] lg:text-xs font-bold ${current.fontClass}`}>Image to skin</span>
                            </button>
                            <button
                                onClick={() => handleModeChange('aigc_text_to_skin')}
                                className={`flex-1 py-3 px-3 flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer border ${genMode === 'aigc_text_to_skin' ? 'bg-[#3c8527]/20 border-[#3c8527] text-white shadow-[0_0_15px_-3px_rgba(60,133,39,0.3)]' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <div key={genMode} className="flex items-center">
                                    <Icon icon="pixelarticons:notes" className={`text-lg lg:text-xl ${genMode === 'aigc_text_to_skin' ? 'text-[#a6df7a]' : 'opacity-60'}`} />
                                </div>
                                <span className={`text-[10px] lg:text-xs font-bold ${current.fontClass}`}>Text to skin</span>
                            </button>
                            <button
                                onClick={() => handleModeChange('aigc_image_edit_to_skin')}
                                className={`flex-1 py-3 px-3 flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer border ${genMode === 'aigc_image_edit_to_skin' ? 'bg-[#3c8527]/20 border-[#3c8527] text-white shadow-[0_0_15px_-3px_rgba(60,133,39,0.3)]' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <div key={genMode} className="flex items-center">
                                    <Icon icon="pixelarticons:edit" className={`text-lg lg:text-xl ${genMode === 'aigc_image_edit_to_skin' ? 'text-[#a6df7a]' : 'opacity-60'}`} />
                                </div>
                                <span className={`text-[10px] lg:text-xs font-bold ${current.fontClass}`}>Image Edit to skin</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
                        {/* Area 1: Upload & Prompt */}
                        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
                            <div className="flex flex-col gap-4">
                                {(genMode === 'aigc_image_to_skin' || genMode === 'aigc_image_edit_to_skin') && (
                                    <div className="flex flex-col gap-3 lg:gap-4 animate-in fade-in duration-300">
                                        <h3 className={`text-white text-xs lg:text-sm m-0 opacity-60 ${current.fontClass}`}>{current.generate.uploadTitle}</h3>
                                        {sourceId ? (
                                            <div className="w-full aspect-square border-2 border-yellow-500/40 bg-yellow-500/5 flex flex-col items-center justify-center gap-2 relative overflow-hidden group">
                                                <div className="absolute top-2 right-2 z-10">
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setSourceId(null);
                                                            setImageFile(null);
                                                            setImagePreviewUrl(null);
                                                            setIsSourcePrivate(false);
                                                            setIsPrivate(false);
                                                        }}
                                                        className="bg-red-500 hover:bg-red-600 text-white p-1 cursor-pointer shadow-sm active:translate-y-px"
                                                        title={current.generate.unlockAndClear}
                                                    >
                                                        <Icon icon="pixelarticons:close" className="text-base" />
                                                    </button>
                                                </div>
                                                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-yellow-500/80 text-black text-[9px] font-bold flex items-center gap-1">
                                                    <Icon icon="pixelarticons:lock" className="text-xs" />
                                                    {current.generate.lockedSource}
                                                </div>
                                                <img src={imagePreviewUrl || ''} className="w-full h-full object-contain" alt="locked" />
                                                {sourceId && (
                                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 text-white/60 text-[8px] font-mono">
                                                        ID: {sourceId.toString().substring(0, 8).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <label
                                                className="w-full aspect-square border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 lg:gap-3 cursor-pointer hover:bg-white/5 transition-colors group relative overflow-hidden"
                                            >
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            const file = e.target.files[0];
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => {
                                                                if (ev.target?.result) {
                                                                    const img = new Image();
                                                                    img.onload = async () => {
                                                                        // Check if it is a Minecraft skin layout file (64x64 or 64x32)
                                                                        if (img.width === 64 && (img.height === 64 || img.height === 32)) {
                                                                            try {
                                                                                const skinCanvas = await Skin2D(ev.target?.result as string);
                                                                                const canvas = document.createElement('canvas');
                                                                                canvas.width = 768;
                                                                                canvas.height = 768;
                                                                                const ctx = canvas.getContext('2d');
                                                                                if (ctx) {
                                                                                    ctx.fillStyle = '#FFFFFF';
                                                                                    ctx.fillRect(0, 0, 768, 768);
                                                                                    ctx.drawImage(skinCanvas, 0, 0, 768, 768);

                                                                                    canvas.toBlob((blob) => {
                                                                                        if (blob) {
                                                                                            const newName = file.name.replace(/\.[^/.]+$/, "") + "_rendered.jpg";
                                                                                            const resizedFile = new File([blob], newName, { type: 'image/jpeg' });
                                                                                            setImageFile(resizedFile);
                                                                                        }
                                                                                    }, 'image/jpeg', 0.82);
                                                                                    setImagePreviewUrl(canvas.toDataURL('image/jpeg', 0.82));
                                                                                }
                                                                            } catch (err) {
                                                                                console.error("Failed to render skin via Skin2D:", err);
                                                                            }
                                                                            return;
                                                                        }

                                                                        // Normal image load logic
                                                                        const canvas = document.createElement('canvas');
                                                                        canvas.width = 768;
                                                                        canvas.height = 768;
                                                                        const ctx = canvas.getContext('2d');
                                                                        if (ctx) {
                                                                            // Fill white background
                                                                            ctx.fillStyle = '#FFFFFF';
                                                                            ctx.fillRect(0, 0, 768, 768);

                                                                            // Calculate aspect ratio
                                                                            const scale = Math.min(768 / img.width, 768 / img.height);
                                                                            const x = (768 - img.width * scale) / 2;
                                                                            const y = (768 - img.height * scale) / 2;
                                                                            const drawWidth = img.width * scale;
                                                                            const drawHeight = img.height * scale;

                                                                            ctx.drawImage(img, x, y, drawWidth, drawHeight);

                                                                            canvas.toBlob((blob) => {
                                                                                if (blob) {
                                                                                    const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                                                                                    const resizedFile = new File([blob], newName, { type: 'image/jpeg' });
                                                                                    setImageFile(resizedFile);
                                                                                }
                                                                            }, 'image/jpeg', 0.82);
                                                                            setImagePreviewUrl(canvas.toDataURL('image/jpeg', 0.82));
                                                                        }
                                                                    };
                                                                    img.src = ev.target.result as string;
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                            e.target.value = ''; // Allow uploading the same file repeatedly
                                                        }
                                                    }}
                                                />
                                                {imagePreviewUrl ? (
                                                    <div key="preview" className="absolute inset-0 w-full h-full overflow-hidden">
                                                        <img src={imagePreviewUrl} className="w-full h-full object-contain" alt="preview" />
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                                                            <Icon icon="pixelarticons:image-gallery" className="text-3xl text-white" />
                                                            <span className={`text-white text-[10px] mt-2 ${current.fontClass}`}>{current.generate.clickReupload}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div key="upload-hint" className="flex flex-col items-center justify-center gap-2 lg:gap-3 pointer-events-none">
                                                        <Icon icon="pixelarticons:cloud-upload" className="text-3xl lg:text-4xl text-white/10 group-hover:text-white/30" />
                                                        <span className={`text-white/20 group-hover:text-white/40 text-[9px] lg:text-[10px] text-center px-4 ${current.fontClass} whitespace-pre-line`}>{current.generate.uploadHint}</span>
                                                    </div>
                                                )}
                                            </label>
                                        )}
                                    </div>
                                )}
                                {(genMode === 'aigc_text_to_skin' || genMode === 'aigc_image_edit_to_skin') && (
                                    <div className="flex flex-col gap-3 lg:gap-4 animate-in fade-in duration-300 h-full">
                                        <h3 className={`text-white text-xs lg:text-sm m-0 opacity-60 ${current.fontClass}`}>{current.generate.textTitle}</h3>
                                        <textarea
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            placeholder={genMode === 'aigc_image_edit_to_skin' ? current.generate.imageEditTextPlaceholder : current.generate.textPlaceholder}
                                            className={`w-full h-32 lg:flex-1 bg-white/5 border border-white/10 p-3 text-white text-[11px] lg:text-xs resize-none focus:outline-none focus:border-green-500/30 transition-colors ${current.fontClass}`}
                                        />
                                    </div>
                                )}
                            </div>
                        </div> {/* End Area 1 */}

                        {/* Area 2: Settings & Action */}
                        <div className="flex-1 flex flex-col gap-4 min-h-0">
                            {/* Advanced Settings */}
                            <div className="flex-1 flex flex-col gap-3 bg-white/5 border border-white/10 p-4 overflow-y-auto custom-scrollbar pr-1">
                                <h3 className={`text-white text-xs lg:text-sm m-0 opacity-80 flex items-center gap-2 ${current.fontClass}`}>
                                    <Icon icon="pixelarticons:sliders" />
                                    {current.generate.advancedSettings}
                                </h3>

                                <div className="flex flex-col gap-4">
                                    {/* Model Version Dropdown */}
                                    <div className="flex flex-col gap-2">
                                        <span className={`text-white/60 text-[10px] ${current.fontClass}`}>
                                            {current.generate.modelVersion}
                                        </span>
                                        <select
                                            value={modelVersion}
                                            onChange={(e) => setModelVersion(e.target.value)}
                                            disabled={modelVersion === 'unknown' || !modelVersion}
                                            className={`bg-white/10 border border-white/10 p-2 text-white text-[11px] lg:text-xs focus:outline-none focus:border-green-500/30 transition-colors cursor-pointer ${current.fontClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {(modelsConfig[genMode] || []).length === 0 ? (
                                                <option value="unknown" className="bg-[#2a2a2a] text-white">
                                                    {current.generate.loadingModels}
                                                </option>
                                            ) : (
                                                (modelsConfig[genMode] || []).map(m => (
                                                    <option key={m} value={m} className="bg-[#2a2a2a] text-white">{m}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>

                                    {/* Advanced Settings: Seed & Steps */}
                                    <div className="flex flex-col gap-4 border-t border-white/10 pt-3">
                                        <div className="flex flex-col gap-2">
                                            <span className={`text-white/60 text-[10px] ${current.fontClass}`}>
                                                {current.generate.inferenceSteps}
                                            </span>
                                            <input
                                                type="number"
                                                min={20}
                                                max={120}
                                                placeholder={current.generate.default}
                                                value={nStep ?? ''}
                                                onChange={(e) => setNStep(e.target.value ? parseInt(e.target.value) : undefined)}
                                                className={`bg-white/10 border border-white/10 p-2 text-white text-[11px] lg:text-xs focus:outline-none focus:border-green-500/30 transition-colors ${current.fontClass}`}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <span className={`text-white/60 text-[10px] ${current.fontClass}`}>
                                                {current.generate.guidanceScale}
                                            </span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min={0.1}
                                                max={15}
                                                placeholder={current.generate.default}
                                                value={guidance ?? ''}
                                                onChange={(e) => setGuidance(e.target.value ? parseFloat(e.target.value) : undefined)}
                                                className={`bg-white/10 border border-white/10 p-2 text-white text-[11px] lg:text-xs focus:outline-none focus:border-green-500/30 transition-colors ${current.fontClass}`}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <span className={`text-white/60 text-[10px] ${current.fontClass}`}>
                                                {current.generate.seed}
                                            </span>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                max={max_seed}
                                                placeholder={current.generate.random}
                                                value={seed ?? ''}
                                                onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                                                className={`bg-white/10 border border-white/10 p-2 text-white text-[11px] lg:text-xs focus:outline-none focus:border-green-500/30 transition-colors ${current.fontClass}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 mt-auto shrink-0">
                                <div className="flex items-center gap-4">
                                    {/* Public Option */}
                                    <label className={`flex items-center gap-2 cursor-pointer group ${sourceId ? 'opacity-60' : ''}`}>
                                        <div className="relative">
                                            <input
                                                type="radio"
                                                className="sr-only"
                                                name="privacy"
                                                checked={!isPrivate}
                                                disabled={!!sourceId}
                                                onChange={() => {
                                                    if (sourceId) return;
                                                    setIsPrivate(false);
                                                }}
                                            />
                                            <div className={`w-5 h-5 border-2 border-black rounded-full transition-colors flex items-center justify-center ${!isPrivate ? 'bg-[#3c8527]' : 'bg-[#555] group-hover:bg-[#666]'}`}>
                                                {!isPrivate && (
                                                    <div className="w-2 h-2 bg-white rounded-full" />
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-white/60 group-hover:text-white/80 text-[10px] lg:text-xs transition-colors ${current.fontClass}`}>
                                            {current.generate.public}
                                        </span>
                                    </label>

                                    {/* Private Option */}
                                    <label className={`flex items-center gap-2 cursor-pointer group ${(!isPro || !!sourceId) ? 'opacity-50' : ''}`}>
                                        <div className="relative">
                                            <input
                                                type="radio"
                                                className="sr-only"
                                                name="privacy"
                                                checked={isPrivate}
                                                disabled={!!sourceId || !isPro}
                                                onChange={() => {
                                                    if (sourceId || !isPro) return;
                                                    setIsPrivate(true);
                                                }}
                                            />
                                            <div className={`w-5 h-5 border-2 border-black rounded-full transition-colors flex items-center justify-center ${isPrivate ? 'bg-[#3c8527]' : 'bg-[#555] group-hover:bg-[#666]'}`}>
                                                {isPrivate && (
                                                    <div className="w-2 h-2 bg-white rounded-full" />
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-white/60 group-hover:text-white/80 text-[10px] lg:text-xs transition-colors ${current.fontClass}`}>
                                            {current.generate.private}
                                        </span>
                                    </label>

                                    {!isPro && (
                                        <div
                                            onClick={() => navigate('/skin/pro')}
                                            className="flex items-center gap-1.5 px-2 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 cursor-pointer hover:bg-yellow-400/20 transition-all animate-in fade-in slide-in-from-left-2 duration-300"
                                        >
                                            <Icon icon="pixelarticons:zap" className="text-xs" />
                                            <span className={`text-[9px] lg:text-[10px] font-bold ${current.fontClass}`}>
                                                {current.generate.privateTip}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {sourceId && (
                                    <div className="text-yellow-500/80 text-[10px] flex items-center gap-1 -mt-1 animate-in fade-in duration-200">
                                        <Icon icon={isSourcePrivate ? "pixelarticons:lock" : "pixelarticons:bullseye"} className="text-xs" />
                                        {isSourcePrivate ? current.generate.privateWarning : current.generate.publicWarning}
                                    </div>
                                )}

                                {/* Quota Display */}
                                {unlimitedQuota ? (
                                    <div className={`text-[10px] lg:text-xs flex text-[#a6df7a] items-center gap-1.5 font-bold ${current.fontClass} -mb-1`}>
                                        <Icon icon="pixelarticons:gift" className="text-yellow-400 animate-bounce" />
                                        <span>{current.lang === 'zh-hans' ? '限时活动，生成不消耗额度' : 'Limited-time event, free generation'}</span>
                                    </div>
                                ) : (
                                    !isPro && quota && (
                                        <div className={`text-[10px] lg:text-xs flex text-[#a6df7a] items-center gap-1.5 opacity-60 ${current.fontClass} -mb-1`}>
                                            <Icon icon="pixelarticons:zap" className="text-[#a6df7a]" />
                                            <span>{current.generate.remainingQuota}{quota.remaining} / {quota.limit}</span>
                                        </div>
                                    )
                                )}

                                <button
                                    disabled={isGenerating || modelVersion === 'unknown' || !modelVersion || (!isAigcSkinEnabled && (genMode === 'aigc_text_to_skin' || genMode === 'aigc_image_edit_to_skin'))}
                                    onClick={handleGenerate}
                                    className={`py-3 lg:py-4 bg-[#3c8527] hover:bg-[#4ea632] disabled:bg-gray-700 text-white border-2 border-black cursor-pointer transition-all flex items-center justify-center gap-2 text-xs lg:text-sm active:transform active:translate-y-0.5 w-full ${current.fontClass}`}
                                >
                                    {isGenerating ? (
                                        <span key="generating" className="flex items-center justify-center gap-2">
                                            <Icon icon="pixelarticons:reload" className="animate-spin" />
                                            {current.generate.btnGenerating}
                                        </span>
                                    ) : (modelVersion === 'unknown' || !modelVersion) ? (
                                        <span key="loading-model" className="flex items-center justify-center gap-2">
                                            <Icon icon="pixelarticons:reload" className="animate-spin" />
                                            {current.generate.btnLoadingModel}
                                        </span>
                                    ) : (!isAigcSkinEnabled && (genMode === 'aigc_text_to_skin' || genMode === 'aigc_image_edit_to_skin')) ? (
                                        <span key="disabled" className="flex items-center justify-center gap-2 opacity-50">
                                            <Icon icon="pixelarticons:close" />
                                            {current.lang === 'zh-hans' ? '功能暂不可用' : 'Temporarily Unavailable'}
                                        </span>
                                    ) : (
                                        <span key="start" className="flex items-center justify-center gap-2">
                                            <Icon icon="pixelarticons:zap" />
                                            {current.generate.btnStart}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                    </div>

                </div> {/* End Main Content Split Frame */}
            {/* End Middle Section */}

            <ConfirmModal
                isOpen={infoModal.isOpen}
                title={infoModal.title}
                message={infoModal.message}
                onClose={() => setInfoModal({ ...infoModal, isOpen: false })}
                current={current}
                type={infoModal.type || 'info'}
                confirmText={current.generate.ok}
            />

            <AnimatePresence>
                {selectedHistory && (
                    <MCModal
                        item={{
                            ...selectedHistory
                        }}
                        current={current}
                        textureUrl={selectedHistory.result}
                        closeModal={() => setSelectedHistory(undefined)}
                        onEdit={(texUrl, logId, isPublic) => navigate('/skin/edit', { state: { textureUrl: texUrl, passedLogId: logId, isPublic } })}
                        onAiEdit={(source: string, id: string, isPublic: boolean, sourceType?: 'source' | 'intermediate') => navigate('/skin/generate', { state: { sourceImage: source, sourceId: id, mode: 'aigc_image_edit_to_skin', isPublic, sourceType } })}
                    />
                )}
            </AnimatePresence>
        </PageContainer>
    )
}
