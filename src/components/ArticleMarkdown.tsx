import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface ArticleMarkdownProps {
    content: string
    allowRawHtml?: boolean
}

type MarkdownElementProps = {
    node?: unknown
    children?: React.ReactNode
}

type MarkdownImageProps = {
    node?: {
        tagName?: string
    }
}

function stripNode<T extends MarkdownElementProps>(props: T): Omit<T, 'node'> {
    const { node, ...rest } = props
    void node
    return rest
}

export function ArticleMarkdown({ content, allowRawHtml = false }: ArticleMarkdownProps) {
    return (
        <ReactMarkdown
            components={{
                h1: (props) => <h1 className="text-3xl font-bold mb-8 border-b border-white/10 pb-4 text-white" {...stripNode(props)} />,
                h2: (props) => <h2 className="text-xl font-bold mt-8 mb-4 text-green-400" {...stripNode(props)} />,
                h3: (props) => <h3 className="text-lg font-bold mt-6 mb-3 text-green-400/90" {...stripNode(props)} />,
                h4: (props) => <h4 className="text-base font-bold mt-4 mb-2 text-green-400/80" {...stripNode(props)} />,
                p: (props) => {
                    const { children, ...rest } = stripNode(props)
                    const isImageOnly = React.Children.toArray(children).every(child => {
                        if (React.isValidElement(child)) {
                            const childProps = child.props as MarkdownImageProps
                            return child.type === 'img' || childProps.node?.tagName === 'img'
                        }
                        return typeof child === 'string' && !child.trim()
                    })

                    if (isImageOnly) {
                        return (
                            <div className="flex flex-wrap justify-center gap-4 my-8">
                                {children}
                            </div>
                        )
                    }

                    return <p className="text-white/80 leading-relaxed mb-4 text-sm sm:text-base" {...rest}>{children}</p>
                },
                ul: (props) => <ul className="list-disc pl-5 mb-4 text-white/70 space-y-2" {...stripNode(props)} />,
                ol: (props) => <ol className="list-decimal pl-5 mb-4 text-white/70 space-y-2" {...stripNode(props)} />,
                li: (props) => <li className="text-sm sm:text-base pl-1 [&>p]:mb-2" {...stripNode(props)} />,
                code: (props) => {
                    const { className, children, ...rest } = stripNode(props) as { className?: string; children?: React.ReactNode }
                    const isInline = !className || !className.startsWith('language-')
                    if (isInline) {
                        return (
                            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs text-green-300" {...rest}>
                                {children}
                            </code>
                        )
                    }
                    return (
                        <code className={`${className || ''} text-white/90 font-mono text-xs sm:text-sm`} {...rest}>
                            {children}
                        </code>
                    )
                },
                pre: (props) => {
                    const { children, ...rest } = stripNode(props)
                    
                    // Try to detect language from child code component
                    let language = ''
                    if (React.isValidElement(children)) {
                        const childProps = children.props as { className?: string }
                        const match = /language-(\w+)/.exec(childProps?.className || '')
                        if (match) {
                            language = match[1]
                        }
                    }

                    return (
                        <div className="relative my-6 rounded-xl border border-white/10 bg-zinc-950/60 backdrop-blur-md overflow-hidden group">
                            {language && (
                                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 text-white/40 uppercase tracking-widest text-[10px] font-mono select-none">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        {language}
                                    </span>
                                </div>
                            )}
                            <pre className="p-4 overflow-x-auto custom-scrollbar text-white/90 leading-relaxed" {...rest}>
                                {children}
                            </pre>
                        </div>
                    )
                },
                blockquote: (props) => <blockquote className="border-l-4 border-green-500/30 pl-4 italic text-white/60 my-6" {...stripNode(props)} />,
                img: (props) => {
                    const { alt, ...rest } = stripNode(props)
                    const [cleanAlt, size] = (alt || '').split('|')
                    const style: React.CSSProperties = {
                        maxWidth: '100%',
                        height: 'auto',
                        borderRadius: '4px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        objectFit: 'cover',
                        imageRendering: 'pixelated'
                    }

                    if (size) {
                        if (size.includes('x')) {
                            const [w, h] = size.split('x')
                            style.width = w.match(/^\d+$/) ? `${w}px` : w
                            style.height = h.match(/^\d+$/) ? `${h}px` : h
                        } else {
                            style.width = size.match(/^\d+$/) ? `${size}px` : size
                        }
                    }

                    return <img alt={cleanAlt} style={style} {...rest} />
                },
                table: (props) => (
                    <div className="overflow-x-auto my-8 border border-white/10 rounded-lg">
                        <table className="w-full text-left border-collapse" {...stripNode(props)} />
                    </div>
                ),
                thead: (props) => <thead className="bg-white/5 border-b border-white/10" {...stripNode(props)} />,
                th: (props) => <th className="p-4 font-bold text-xs uppercase tracking-wider text-green-400" {...stripNode(props)} />,
                td: (props) => <td className="p-4 border-b border-white/5 text-sm text-white/80" {...stripNode(props)} />,
                tr: (props) => <tr className="hover:bg-white/[0.02] transition-colors" {...stripNode(props)} />,
            }}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={allowRawHtml ? [rehypeRaw] : []}
        >
            {content}
        </ReactMarkdown>
    )
}
