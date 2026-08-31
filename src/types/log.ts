export interface GenerationLogItemBrief {
    prompt: string
    result: string
    is_public: boolean
    id: string
    license?: SkinLicense
}

export interface SkinLicense {
    code: 'unknown' | 'cc-by-nc-4.0' | 'entropydrop-commercial-1.0'
    public_license: 'cc-by-nc-4.0' | null
    version: number
    granted_at: string | null
    commercial_licensee_user_id: string | null
}
export interface GenerationLogItem extends GenerationLogItemBrief {
    result_render_2d?: string
    name: string
    mode: 'aigc_text_to_skin' | 'aigc_image_to_skin' | 'aigc_image_edit_to_skin' | 'human_edit' | 'human_upload'
    source: string
    result: string
    edited_image_url?: string
    image_to_skin_edited_image_url?: string
    status?: 'pending' | 'processing' | 'pending_skin' | 'processing_skin' | 'success' | 'failed'
    queue_position?: number
    error_msg?: string
    has_feedback?: boolean
    creator: {
        id: string
        username: string
        avatar_url?: string
        skin_url?: string | null
        skin_type?: string | null
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
