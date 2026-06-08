import { useRef, useEffect } from 'react'
import '@mdxeditor/editor/style.css'
import {
    MDXEditor,
    headingsPlugin,
    listsPlugin,
    quotePlugin,
    thematicBreakPlugin,
    markdownShortcutPlugin,
    toolbarPlugin,
    UndoRedo,
    BoldItalicUnderlineToggles,
    BlockTypeSelect,
    CreateLink,
    InsertTable,
    InsertCodeBlock,
    ListsToggle,
    tablePlugin,
    codeBlockPlugin,
    codeMirrorPlugin,
    linkPlugin,
    linkDialogPlugin,
    InsertThematicBreak,
    Separator,
    type MDXEditorMethods
} from '@mdxeditor/editor'

interface MarkdownEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    current: { fontClass?: string }
}

export function MarkdownEditor({ value, onChange, placeholder, current }: MarkdownEditorProps) {
    const editorRef = useRef<MDXEditorMethods>(null)

    // Sync external changes if needed (to prevent cursor jumping, we only set if it actually differs)
    useEffect(() => {
        if (editorRef.current) {
            const currentMarkdown = editorRef.current.getMarkdown()
            if (currentMarkdown !== value) {
                editorRef.current.setMarkdown(value)
            }
        }
    }, [value])

    return (
        <div className={`mdx-editor-dark-wrapper w-full border border-white/10 bg-black/40 text-white rounded-xs overflow-hidden ${current.fontClass || ''}`}>
            <MDXEditor
                ref={editorRef}
                markdown={value}
                onChange={onChange}
                placeholder={placeholder || "Describe details, tips, guides..."}
                className="dark-theme dark-editor text-xs sm:text-sm"
                contentEditableClassName="prose prose-invert max-w-none p-4 min-h-[220px] text-white/95 focus:outline-none font-sans"
                plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    quotePlugin(),
                    thematicBreakPlugin(),
                    linkPlugin(),
                    linkDialogPlugin(),
                    tablePlugin(),
                    codeBlockPlugin({ defaultCodeBlockLanguage: 'javascript' }),
                    codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', css: 'CSS', html: 'HTML', python: 'Python', json: 'JSON' } }),
                    markdownShortcutPlugin(),
                    toolbarPlugin({
                        toolbarClassName: 'bg-zinc-950/60 border-b border-white/10 p-1 flex flex-wrap items-center gap-1 select-none',
                        toolbarContents: () => (
                            <div className="flex flex-wrap items-center gap-1">
                                <UndoRedo />
                                <Separator />
                                <BlockTypeSelect />
                                <Separator />
                                <BoldItalicUnderlineToggles />
                                <Separator />
                                <ListsToggle />
                                <Separator />
                                <CreateLink />
                                <InsertTable />
                                <InsertCodeBlock />
                                <InsertThematicBreak />
                            </div>
                        )
                    })
                ]}
            />
        </div>
    )
}

