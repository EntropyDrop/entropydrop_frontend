export interface GenerationLogItemBrief {
    prompt: string
    result: string
    is_public: boolean
    id: string
}
export interface GenerationLogItem extends GenerationLogItemBrief {
    result_render_2d?: string
    name: string
    mode: 'aigc_text_to_skin' | 'aigc_image_to_skin' | 'aigc_image_edit_to_skin' | 'human_edit' | 'human_upload'
    source: string
    result: string
    edited_image_url?: string
    edit_source_type?: 'source' | 'intermediate'
    status?: 'pending' | 'processing' | 'pending_skin' | 'processing_skin' | 'success' | 'failed'
    queue_position?: number
    error_msg?: string
    has_feedback?: boolean
    creator: {
        id: string
        username: string
        avatar_url?: string
    }
    timestamp: string
    likes_count: number
    is_liked: boolean
    model_version: string
    parent?: string
    seed?: number
    n_step?: number
    guidance?: number
    is_pro: boolean
}
