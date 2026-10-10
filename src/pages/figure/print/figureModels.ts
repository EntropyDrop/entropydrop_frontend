import { getModelProfile, type ModelType } from '../../../lib/minefigure/shared/characterProportions.js'

export const FIGURE_MODELS = [
    { id: 'cute10', name: 'CUTE-10cm', orderModelType: 'Cute DIY Kit' },
] as const

export type FigureModel = typeof FIGURE_MODELS[number]
export type PrintModelType = Extract<ModelType, 'cute7' | 'cute10'>
export const DEFAULT_PRINT_MODEL: PrintModelType = 'cute10'

export function getPrintModelProfile(modelType: PrintModelType = DEFAULT_PRINT_MODEL) {
    return { ...getModelProfile(modelType), name: modelType === 'cute7' ? 'CUTE-7cm' : 'CUTE-10cm', heightCm: modelType === 'cute7' ? 7 : 10 }
}

export function getOrderPrintModel(modelName?: string | null): PrintModelType {
    // Existing order snapshots keep their original manufacturing configuration.
    return modelName?.includes('10cm') ? 'cute10' : 'cute7'
}

export function getFigureModelName(orderModelType: string) {
    return FIGURE_MODELS.find(model => model.orderModelType === orderModelType)?.name ?? orderModelType
}
