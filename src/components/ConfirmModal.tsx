import { type LangData } from '../constants/lang'

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
    onConfirm?: () => void; // If not provided, it serves as a single-button Alert modal
    current: LangData;
    type?: 'info' | 'error' | 'warning' | 'success'; 
    confirmText?: string;
    cancelText?: string;
}

export function ConfirmModal({ 
    isOpen, 
    title, 
    message, 
    onClose, 
    onConfirm, 
    current, 
    type = 'info', 
    confirmText, 
    cancelText 
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const buttonStyles = {
        info: "bg-blue-800 hover:bg-blue-600",
        error: "bg-red-800 hover:bg-red-600",
        warning: "bg-yellow-700 hover:bg-yellow-600",
        success: "bg-green-800 hover:bg-green-600"
    };

    const confirmBtnStyle = buttonStyles[type] || buttonStyles.info;

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
                    {onConfirm && (
                        <button 
                            onClick={onClose}
                            className={`px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white/60 hover:text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                        >
                            {cancelText || current.modal.cancel}
                        </button>
                    )}
                    <button 
                        onClick={() => {
                            if (onConfirm) onConfirm();
                            else onClose(); // In single-button mode, clicking triggers close
                        }}
                        className={`px-6 py-2 ${confirmBtnStyle} text-white border-2 border-black cursor-pointer text-xs transition-all active:translate-y-0.5 ${current.fontClass}`}
                    >
                        {confirmText || current.modal.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
}
