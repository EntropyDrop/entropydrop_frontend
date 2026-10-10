export const FIGURE_MODELS = [
    { id: 'cute', name: 'CUTE-7cm', orderModelType: 'Cute DIY Kit' },
] as const

export type FigureModel = typeof FIGURE_MODELS[number]

export function getFigureModelName(orderModelType: string) {
    return FIGURE_MODELS.find(model => model.orderModelType === orderModelType)?.name ?? orderModelType
}
