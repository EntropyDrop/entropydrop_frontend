import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GenerationLogItem } from '../types/log'
import type { Collection, CollectionItem } from './MCModal'
import { useEffect, useRef } from 'react'
import { Skin2D } from './utils'

function Skin2DAvatar({ src }: { src: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let isMounted = true;
        Skin2D(src).then(canvas => {
            if (!isMounted || !canvasRef.current) return;
            const targetCanvas = canvasRef.current;
            targetCanvas.width = canvas.width;
            targetCanvas.height = canvas.height;
            const ctx = targetCanvas.getContext('2d');
            ctx?.drawImage(canvas, 0, 0);
        }).catch(err => {
            console.warn("Failed to render Skin2D:", err);
        });
        return () => { isMounted = false; };
    }, [src]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
        />
    );
}

interface MCModalSidebarProps {
    sidebarType: 'author' | 'containing' | 'derived';
    item: GenerationLogItem;
    parentItem?: GenerationLogItem | null;
    collections: Collection[];
    expandedCols: string[];
    itemsByCol: { [id: string]: CollectionItem[] };
    isLoadingNav: boolean;
    toggleCollection: (id: string) => void;
    handleItemSelect: (id: string) => void;
    setShowSidebar: (show: boolean) => void;
    colPage: number;
    colTotalPages: number;
    onLoadMore: () => void;
    itemsPageByCol: { [id: string]: number };
    itemsTotalPagesByCol: { [id: string]: number };
    onLoadMoreItems: (colId: string) => void;
    current: any;
}

export function MCModalSidebar({
    sidebarType,
    item,
    parentItem,
    collections,
    expandedCols,
    itemsByCol,
    isLoadingNav,
    toggleCollection,
    handleItemSelect,
    setShowSidebar,
    colPage,
    colTotalPages,
    onLoadMore,
    itemsPageByCol,
    itemsTotalPagesByCol,
    onLoadMoreItems,
    current
}: MCModalSidebarProps) {
    return (
        <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: window.innerWidth < 1024 ? "100%" : 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="h-full lg:h-[600px] border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0a0a0a] flex flex-col overflow-hidden shrink-0"
        >
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                <div className="flex items-center gap-2">
                    <Icon icon={sidebarType === 'author' ? "pixelarticons:user" : sidebarType === 'derived' ? "pixelarticons:git-merge" : "pixelarticons:folder"} className="text-base text-[#4ea632]" />
                    <span className="font-pixel-hans text-[11px] text-white/90">
                        {sidebarType === 'author' ? item.creator.username : sidebarType === 'derived' ? current.mcmodal.allDerived : current.mcmodal.relatedCollections}
                    </span>
                </div>
                <button onClick={() => setShowSidebar(false)} className="text-white/40 hover:text-white transition-colors cursor-pointer">
                    <Icon icon="pixelarticons:arrow-left" className="text-lg" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {isLoadingNav && collections.length === 0 ? (
                    <div className="text-center text-white/30 text-[10px] font-pixel-hans py-4">{current.mcmodal?.loading || '加载中...'}</div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {sidebarType === 'derived' && parentItem && (
                            <div className="px-1 pt-1">
                                <div
                                    onClick={() => handleItemSelect(parentItem.id)}
                                    className="flex items-center gap-1.5 p-1.5 hover:bg-white/5 cursor-pointer transition-all group bg-white/3 border border-white/5 rounded"
                                >
                                    <div className="w-5 h-5 bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                                        {parentItem.result && (
                                            <Skin2DAvatar src={parentItem.result} />
                                        )}
                                    </div>
                                    <div className="flex flex-col flex-1 truncate">
                                        <div className="flex items-center gap-1">
                                            <Icon icon="pixelarticons:arrow-left" className="text-[#4ea632] text-xs" />
                                            <span className="font-pixel-hans text-[9px] text-[#4ea632]">{current.mcmodal.derivedFrom}</span>
                                        </div>
                                        <span className="font-pixel-hans text-xs text-white/80 truncate">{parentItem.name || current.mcmodal.noName}</span>
                                    </div>
                                    <Icon icon="pixelarticons:chevron-right" className="text-white/30 group-hover:text-white/60 text-xs" />
                                </div>
                                <div className="border-b border-white/5 mt-1.5 mb-1" />
                            </div>
                        )}
                        {collections.map(col => (
                            <div key={col.id} className="flex flex-col">
                                <div
                                    onClick={() => toggleCollection(col.id)}
                                    className="flex items-center gap-1.5 p-1.5 hover:bg-white/5 cursor-pointer transition-colors group"
                                >
                                    <div className={`transition-transform duration-200 inline-block ${expandedCols.includes(col.id) ? 'rotate-90' : ''}`}>
                                        <Icon icon="pixelarticons:chevron-right" className="text-white/40 group-hover:text-white/60 text-base" />
                                    </div>
                                    <Icon icon="pixelarticons:folder" className="text-yellow-500 text-base" />
                                    <div className="flex flex-col flex-1 truncate">
                                        <span className="font-pixel-hans text-xs text-white/80 truncate">{col.name}</span>
                                        {sidebarType === 'containing' && col.username && (
                                            <span className="text-[9px] text-white/40 font-pixel-hans">by {col.username}</span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-white/40 font-pixel-hans">{col.item_count}</span>
                                </div>

                                <AnimatePresence>
                                    {expandedCols.includes(col.id) && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden pl-5 flex flex-col gap-0.5 mt-0.5"
                                        >
                                            {!itemsByCol[col.id] ? (
                                                <div className="text-[10px] text-white/20 font-pixel-hans p-1.5">{current.mcmodal?.loading || '加载中...'}</div>
                                            ) : itemsByCol[col.id].length === 0 ? (
                                                <div className="text-[10px] text-white/20 font-pixel-hans p-1.5">{current.mcmodal?.noPublicItems || '无公开项目'}</div>
                                            ) : (
                                                itemsByCol[col.id].map(subItem => (
                                                    <div
                                                        key={subItem.id}
                                                        onClick={() => handleItemSelect(subItem.log_id)}
                                                        className={`flex items-center gap-1.5 p-1 hover:bg-white/5 cursor-pointer rounded transition-colors ${item.id === subItem.log_id ? 'bg-[#4ea632]/10 border-l-2 border-[#4ea632]' : ''}`}
                                                    >
                                                        <div className="w-5 h-5 bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                                                            {subItem.data && subItem.data.result && (
                                                                <Skin2DAvatar src={subItem.data.result} />
                                                            )}
                                                        </div>
                                                        <span className="font-pixel-hans text-[11px] text-white/60 truncate flex-1 hover:text-white transition-colors">
                                                            {subItem.name}
                                                        </span>
                                                    </div>
                                                ))
                                            )}

                                            {(itemsPageByCol[col.id] || 1) < (itemsTotalPagesByCol[col.id] || 1) && (
                                                <button
                                                    onClick={() => onLoadMoreItems(col.id)}
                                                    className="text-[9px] text-[#4ea632] hover:underline cursor-pointer py-1 text-center font-pixel-hans mt-1 self-center"
                                                >
                                                    {current.orders?.loadMore || '加载更多'}...
                                                </button>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}

                        {colPage < colTotalPages && (
                            <button
                                onClick={onLoadMore}
                                className="w-full text-center text-white/40 hover:text-white text-[10px] font-pixel-hans py-2 bg-white/3 hover:bg-white/5 cursor-pointer mt-1 border border-white/5 rounded"
                            >
                                {isLoadingNav ? (current.mcmodal?.loading || "加载中...") : (current.orders?.loadMore || "加载更多")}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
