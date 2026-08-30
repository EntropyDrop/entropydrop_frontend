import { Icon } from '@iconify/react'
import { motion } from 'framer-motion'
import type { LangData } from '../constants/lang'

export interface UploadTargetCollection {
    id: number | string
    name: string
    is_public: boolean
    item_count: number
    original_creation: boolean
    user_id?: number
}

interface CollectionUploadPickerProps {
    current: LangData
    collections: UploadTargetCollection[]
    activeTab: 'public' | 'private'
    selectedCollectionId: number | string | null
    page: number
    totalPages: number
    isLoading: boolean
    isPrivateUploadDisabled: boolean
    onTabChange: (tab: 'public' | 'private') => void
    onSelectCollection: (collection: UploadTargetCollection) => void
    onPageChange: (page: number) => void
    onChooseImage: () => void
    onClose: () => void
}

export function CollectionUploadPicker({
    current,
    collections,
    activeTab,
    selectedCollectionId,
    page,
    totalPages,
    isLoading,
    isPrivateUploadDisabled,
    onTabChange,
    onSelectCollection,
    onPageChange,
    onChooseImage,
    onClose
}: CollectionUploadPickerProps) {
    const hasSelection = selectedCollectionId !== null

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label={current.collection.uploadDestination}
            className="absolute top-full right-0 mt-3 z-50 flex w-[280px] max-w-[calc(100vw-2rem)] flex-col border border-white/10 bg-[#0a0a0a] shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex items-start justify-between gap-3 border-b border-white/5 p-3">
                <div className="min-w-0">
                    <div className={`text-[11px] text-white/80 ${current.fontClass}`}>
                        {current.collection.upload}
                    </div>
                    <div className={`mt-1 text-[9px] text-white/30 ${current.fontClass}`}>
                        {current.collection.uploadDestination}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={current.modal.cancel}
                    className="shrink-0 cursor-pointer p-0.5 text-white/30 transition-colors hover:text-white"
                >
                    <Icon icon="pixelarticons:close" className="text-sm" />
                </button>
            </div>

            <div className="flex border-b border-white/5 bg-black/20">
                <button
                    type="button"
                    onClick={() => onTabChange('public')}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-1 p-2 text-center text-[10px] transition-colors ${current.fontClass} ${activeTab === 'public'
                        ? 'border-b-2 border-[#4ea632] bg-white/5 text-[#4ea632]'
                        : 'text-white/40 hover:text-white/60'
                        }`}
                >
                    <Icon icon="pixelarticons:earth" className="text-[11px]" />
                    {current.collection.public}
                </button>
                <button
                    type="button"
                    onClick={() => onTabChange('private')}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-1 p-2 text-center text-[10px] transition-colors ${current.fontClass} ${activeTab === 'private'
                        ? 'border-b-2 border-[#4ea632] bg-white/5 text-[#4ea632]'
                        : 'text-white/40 hover:text-white/60'
                        }`}
                >
                    <Icon icon="pixelarticons:lock" className="text-[11px]" />
                    {current.collection.private}
                </button>
            </div>

            {isLoading ? (
                <div className={`p-6 text-center text-[10px] text-white/30 ${current.fontClass}`}>
                    {current.mcmodal.loading}
                </div>
            ) : (
                <div className="max-h-[264px] overflow-y-auto p-1 custom-scrollbar">
                    {collections.length === 0 ? (
                        <div className={`p-6 text-center text-[10px] text-white/20 ${current.fontClass}`}>
                            {current.collection.noCollectionAvailable}
                        </div>
                    ) : collections.map((collection) => {
                        const isSelected = String(selectedCollectionId) === String(collection.id)
                        return (
                            <button
                                type="button"
                                key={collection.id}
                                onClick={() => onSelectCollection(collection)}
                                aria-pressed={isSelected}
                                className="group flex w-full cursor-pointer items-center gap-2 p-2 text-left transition-colors hover:bg-white/5"
                            >
                                <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[8px] ${isSelected
                                    ? 'border-[#4ea632] bg-[#4ea632] text-white'
                                    : 'border-white/20 text-transparent'
                                    }`}>
                                    ✓
                                </div>
                                <Icon
                                    icon={collection.original_creation ? 'pixelarticons:image' : 'pixelarticons:folder'}
                                    className="shrink-0 text-sm text-white/30 group-hover:text-[#4ea632]"
                                />
                                <span className={`min-w-0 flex-1 truncate text-xs text-white/80 ${current.fontClass}`}>
                                    {collection.name}
                                </span>
                                <span className="flex shrink-0 items-center gap-1 text-[9px] text-white/25">
                                    <Icon icon={collection.is_public ? 'pixelarticons:bullseye' : 'pixelarticons:lock'} />
                                    {collection.item_count}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            <div className="flex items-center justify-center gap-3 border-t border-white/5 px-2 py-1.5">
                <button
                    type="button"
                    disabled={isLoading || page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    aria-label={current.collection.previousPage}
                    className="cursor-pointer p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                >
                    <Icon icon="pixelarticons:chevron-left" className="text-xs" />
                </button>
                <span className={`min-w-10 text-center text-[9px] text-white/35 ${current.fontClass}`}>
                    {page}/{Math.max(1, totalPages)}
                </span>
                <button
                    type="button"
                    disabled={isLoading || page >= Math.max(1, totalPages)}
                    onClick={() => onPageChange(Math.min(Math.max(1, totalPages), page + 1))}
                    aria-label={current.collection.nextPage}
                    className="cursor-pointer p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                >
                    <Icon icon="pixelarticons:chevron-right" className="text-xs" />
                </button>
            </div>

            {isPrivateUploadDisabled && activeTab === 'private' && (
                <div className={`flex items-center gap-1.5 border-t border-yellow-400/10 bg-yellow-400/5 px-3 py-2 text-[9px] text-yellow-400/80 ${current.fontClass}`}>
                    <Icon icon="pixelarticons:zap" className="shrink-0" />
                    {current.generate.privateTip}
                </div>
            )}

            <div className="border-t border-white/5 p-2">
                <button
                    type="button"
                    onClick={onChooseImage}
                    disabled={!hasSelection || (isPrivateUploadDisabled && activeTab === 'private')}
                    className={`flex w-full items-center justify-center gap-2 bg-[#4ea632] py-2 text-[11px] text-white transition-colors hover:bg-[#3c8527] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/20 ${current.fontClass}`}
                >
                    <Icon icon="pixelarticons:image-plus" className="text-sm" />
                    {current.collection.chooseImage}
                </button>
            </div>
        </motion.div>
    )
}
