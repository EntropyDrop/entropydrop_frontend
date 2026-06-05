import { type ReactNode } from 'react'

interface PageContainerProps {
    children: ReactNode
    alignItems?: string // e.g., 'items-center', 'items-start lg:items-center'
    maxWidth?: string // e.g., 'max-w-7xl', 'max-w-4xl'
    height?: string // e.g., 'h-full', 'h-auto'
    bg?: string // e.g., 'bg-black/40 backdrop-blur-md', 'bg-black/60 backdrop-blur-xl'
    gap?: string // e.g., 'gap-6', 'gap-4'
    overflow?: string // e.g., 'overflow-y-auto custom-scrollbar'
    animate?: string // e.g., 'animate-in fade-in duration-300'
    innerPadding?: string // overrides the default inner card padding
    className?: string // extra class names for the inner card container
    outerClassName?: string // extra class names for the outer wrapper container
}

export function PageContainer({
    children,
    alignItems = 'items-center',
    maxWidth = 'max-w-7xl',
    height = 'h-full',
    bg = 'bg-black/40 backdrop-blur-md',
    gap = 'gap-6',
    overflow = 'overflow-y-auto custom-scrollbar',
    animate = 'animate-in fade-in duration-300',
    innerPadding = 'p-3 sm:p-6',
    className = '',
    outerClassName = ''
}: PageContainerProps) {
    // CENTRALIZED LAYOUT SPACING CONSTANTS
    const outerSpacing = 'p-1 sm:p-2 lg:p-3 pt-20 sm:pt-28 lg:pt-32'

    return (
        <div className={`absolute inset-0 z-10 flex justify-center box-border overflow-y-auto pointer-events-none ${alignItems} ${outerSpacing} ${outerClassName}`}>
            <div className={`w-full ${maxWidth} ${height} flex flex-col border border-white/10 pointer-events-auto text-white ${bg} ${innerPadding} ${gap} ${overflow} ${animate} ${className}`}>
                {children}
            </div>
        </div>
    )
}
