import { useRef, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
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
    InsertTable,
    InsertCodeBlock,
    ListsToggle,
    tablePlugin,
    codeBlockPlugin,
    codeMirrorPlugin,
    InsertThematicBreak,
    Separator,
    imagePlugin,
    type MDXEditorMethods
} from '@mdxeditor/editor'
import { apiFetch } from '../utils/api'
import { compressImage } from './utils'

interface MarkdownEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    current: { fontClass?: string }
}

export function MarkdownEditor({ value, onChange, placeholder, current }: MarkdownEditorProps) {
    const editorRef = useRef<MDXEditorMethods>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploadState, setUploadState] = useState<{ isUploading: boolean; progress: number }>({
        isUploading: false,
        progress: 0
    })

    // Sync external changes if needed (to prevent cursor jumping, we only set if it actually differs)
    useEffect(() => {
        if (editorRef.current) {
            const currentMarkdown = editorRef.current.getMarkdown()
            if (currentMarkdown !== value) {
                editorRef.current.setMarkdown(value)
            }
        }
    }, [value])

    const uploadImageFile = async (rawFile: File): Promise<string> => {
        try {
            setUploadState({ isUploading: true, progress: 0 })

            const file = await compressImage(rawFile)

            // 1. Get presigned URL
            const res = await apiFetch('/api/upload/presigned-url', {
                method: 'POST',
                body: JSON.stringify({
                    filename: file.name,
                    content_type: file.type
                })
            })
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.detail || 'Failed to get upload URL')
            }
            const { uploadUrl, fields, fileUrl } = await res.json()

            // 2. Build FormData
            const formData = new FormData()
            Object.entries(fields).forEach(([key, val]) => {
                formData.append(key, val as string)
            })
            formData.append('file', file)

            // 3. Upload using XMLHttpRequest to track progress
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', uploadUrl)

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100)
                        setUploadState({ isUploading: true, progress: percent })
                    }
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve()
                    } else {
                        reject(new Error(`Upload failed with status: ${xhr.status}`))
                    }
                }

                xhr.onerror = () => {
                    reject(new Error('Network error during upload'))
                }

                xhr.send(formData)
            })

            return fileUrl

        } catch (err: any) {
            console.error(err)
            alert(err.message || 'Failed to upload image')
            throw err
        } finally {
            setUploadState({ isUploading: false, progress: 0 })
        }
    }

    const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''

        try {
            const url = await uploadImageFile(file)
            if (editorRef.current) {
                editorRef.current.focus()
                editorRef.current.insertMarkdown(`![image](${url})`)
            }
        } catch (err) {
            // Error is handled inside uploadImageFile
        }
    }

    return (
        <div className={`mdx-editor-dark-wrapper w-full border border-white/10 bg-black/40 text-white rounded-xs overflow-hidden ${current.fontClass || ''}`}>
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
            />
            {uploadState.isUploading && (
                <div className="w-full bg-zinc-950 h-1 relative overflow-hidden">
                    <div
                        className="bg-green-500 h-full transition-all duration-150"
                        style={{ width: `${uploadState.progress}%` }}
                    />
                </div>
            )}
            <MDXEditor
                ref={editorRef}
                markdown={value}
                onChange={onChange}
                placeholder={placeholder || "Describe details, tips, guides..."}
                className="dark-theme dark-editor text-xs sm:text-sm"
                contentEditableClassName={`prose prose-invert max-w-none p-4 min-h-[220px] text-white/95 focus:outline-none ${current.fontClass || 'font-pixel-hans'}`}
                plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    quotePlugin(),
                    thematicBreakPlugin(),
                    tablePlugin(),
                    codeBlockPlugin({ defaultCodeBlockLanguage: 'javascript' }),
                    codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', css: 'CSS', html: 'HTML', python: 'Python', json: 'JSON' } }),
                    imagePlugin({
                        imageUploadHandler: uploadImageFile
                    }),
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
                                <InsertTable />
                                <InsertCodeBlock />
                                <button
                                    type="button"
                                    title="Upload Image"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-xs flex items-center justify-center cursor-pointer transition-colors"
                                >
                                    <Icon icon="pixelarticons:image" className="text-lg" />
                                </button>
                                <InsertThematicBreak />
                            </div>
                        )
                    })
                ]}
            />
        </div>
    )
}
