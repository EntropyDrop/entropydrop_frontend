import { Icon } from '@iconify/react'
import { motion } from 'framer-motion'
import type { Collection } from './MCModal'

interface MCModalDropdownProps {
    myCollections: Collection[];
    mySelectedIds: string[];
    activeTab: 'public' | 'private';
    isLoadingMyCollections: boolean;
    isSavingMyCollections: boolean;
    newCollectionName: string;
    setNewCollectionName: (s: string) => void;
    setActiveTab: (t: 'public' | 'private') => void;
    handleToggleMyCollection: (id: string) => void;
    handleCreateCollection: (e: any) => void;
    handleSaveMyCollection: () => void;
    isItemPublic?: boolean;
    hasMore?: boolean;
    onLoadMore?: () => void;
    current: any;
}

export function MCModalDropdown({
    myCollections,
    mySelectedIds,
    activeTab,
    isLoadingMyCollections,
    isSavingMyCollections,
    newCollectionName,
    setNewCollectionName,
    setActiveTab,
    handleToggleMyCollection,
    handleCreateCollection,
    handleSaveMyCollection,
    isItemPublic = true,
    hasMore = false,
    onLoadMore,
    current
}: MCModalDropdownProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full mb-3 right-0 w-[240px] bg-[#0a0a0a] border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.8)] z-50 flex flex-col pointer-events-auto"
            onClick={e => e.stopPropagation()}
        >
            <div className="p-3 border-b border-white/5 font-pixel-hans text-[11px] text-white/60">
                {current.mcmodal.saveToCollection}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-black/20">
                <div
                    onClick={() => isItemPublic && setActiveTab('public')}
                    className={`flex-1 p-2 text-center text-[10px] font-pixel-hans cursor-pointer transition-colors flex items-center justify-center gap-1 ${activeTab === 'public' ? 'bg-white/5 text-[#4ea632] border-b-2 border-[#4ea632]' : 'text-white/40 hover:text-white/60'} ${!isItemPublic ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={!isItemPublic ? current.mcmodal.privateWarning : ""}
                >
                    <Icon icon="pixelarticons:earth" className="text-[11px]" />
                    {current.mcmodal.public}
                </div>
                <div
                    onClick={() => setActiveTab('private')}
                    className={`flex-1 p-2 text-center text-[10px] font-pixel-hans cursor-pointer transition-colors flex items-center justify-center gap-1 ${activeTab === 'private' ? 'bg-white/5 text-[#4ea632] border-b-2 border-[#4ea632]' : 'text-white/40 hover:text-white/60'}`}
                >
                    <Icon icon="pixelarticons:lock" className="text-[11px]" />
                    {current.mcmodal.private}
                </div>
            </div>

            {isLoadingMyCollections ? (
                <div className="p-4 text-center text-white/30 text-[10px] font-pixel-hans">{current.mcmodal.loading}</div>
            ) : (
                <div className="flex flex-col flex-1 max-h-[300px]">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        {myCollections.filter(c => activeTab === 'public' ? c.is_public : !c.is_public).length === 0 ? (
                            <div className="p-4 text-center text-white/20 text-[10px] font-pixel-hans">{current.mcmodal.noCollection}</div>
                        ) : myCollections.filter(c => activeTab === 'public' ? c.is_public : !c.is_public).map(col => (
                            <div
                                key={col.id}
                                onClick={() => handleToggleMyCollection(col.id)}
                                className="flex items-center gap-2 p-1.5 hover:bg-white/5 cursor-pointer rounded transition-colors group"
                            >
                                <div className={`w-3.5 h-3.5 border flex items-center justify-center text-[8px] ${mySelectedIds.includes(col.id) ? 'bg-[#4ea632] border-[#4ea632]' : 'border-white/20'}`}>
                                    {mySelectedIds.includes(col.id) && "✓"}
                                </div>
                                <span className="font-pixel-hans text-xs text-white/80 flex-1 truncate">{col.name}</span>
                            </div>
                        ))}

                        {hasMore && (
                            <div className="p-2 text-center border-t border-white/5 mt-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onLoadMore && onLoadMore(); }}
                                    className="text-[10px] font-pixel-hans text-[#4ea632] hover:text-[#5fc63d] cursor-pointer"
                                >
                                    {current.orders.loadMore}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Create Collection */}
                    <div className="p-2 border-t border-white/5 flex flex-col gap-1.5">
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder={current.mcmodal.createCollection + '...'}
                                value={newCollectionName}
                                onChange={e => setNewCollectionName(e.target.value)}
                                className="flex-1 min-w-0 bg-black/40 border border-white/10 px-2 py-1 text-[10px] font-pixel-hans text-white outline-none"
                            />
                            <button
                                onClick={handleCreateCollection}
                                disabled={!newCollectionName.trim()}
                                className="px-2 bg-[#38598b] hover:bg-[#4a6bb4] text-[10px] font-pixel-hans text-white shrink-0"
                            >
                                {current.collection.btnCreate}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Action Button */}
                    <div className="p-2 border-t border-white/5 flex gap-2">
                        <button
                            onClick={handleSaveMyCollection}
                            disabled={isSavingMyCollections}
                            className="flex-1 bg-[#4ea632] hover:bg-[#3c8527] text-white py-1.5 text-[11px] font-pixel-hans text-center transition-colors"
                        >
                            {isSavingMyCollections ? current.mcmodal.saving : current.mcmodal.confirm}
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
