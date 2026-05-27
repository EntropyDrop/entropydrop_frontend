import { type LangData } from '../constants/lang'

interface ErrorModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
    current: LangData;
}

export function ErrorModal({ isOpen, title, message, onClose, current }: ErrorModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
            <div className="w-full max-w-sm bg-[#1a1a1a] border-2 border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
                <h3 className={`text-white text-xl m-0 ${current.fontClass}`}>
                    {title}
                </h3>
                
                <p className={`text-white/60 text-sm ${current.fontClass}`}>
                    {message}
                </p>

                <div className="flex gap-3 justify-end mt-1">
                    <button 
                        onClick={onClose}
                        className={`px-6 py-2 bg-red-800 hover:bg-red-600 text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                    >
                        {current.modal.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
}
