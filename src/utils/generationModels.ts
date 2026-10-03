export interface GenerationModelOption {
    id: string
    model_version: string
    pricing_tier?: 'standard' | 'pro'
}

export function generationModelParams(id: string, options: Record<string, GenerationModelOption>) {
    const option = options[id]
    const params = new URLSearchParams()
    if (option) {
        params.set('model_version', option.model_version)
        if (option.pricing_tier) params.set('pricing_tier', option.pricing_tier)
    } else if (id.includes(' + ')) {
        const [aux, model] = id.split(' + ')
        params.set('aux_model_version', aux)
        params.set('model_version', model)
    } else {
        params.set('model_version', id)
    }
    return params
}

export function preferredGenerationModel(
    ids: string[],
    maintenance: Record<string, boolean>,
) {
    return ids.find(id => !maintenance[id])
        || ids[0]
        || 'unknown'
}

export function resolveGenerationModel(
    id: string,
    options: Record<string, GenerationModelOption>,
    isPro: boolean,
    maintenance: Record<string, boolean>,
) {
    const selected = options[id]
    if (!isPro || selected?.pricing_tier !== 'standard') return id

    return Object.values(options).find(option =>
        option.model_version === selected.model_version
        && option.pricing_tier === 'pro'
        && !maintenance[option.id]
    )?.id || id
}
