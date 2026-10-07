import { useSkinLicensePolicy } from '../../hooks/useSkinLicensePolicy'

export function useSaveLicensePreview(parentSkinId: string | null) {
    const preview = useSkinLicensePolicy({ operation: 'save', parentId: parentSkinId })
    return { saveLicensePreview: preview.code, isProUser: preview.policy?.is_pro === true,
        parentIsPrivate: preview.policy?.parent_is_private, policyKey: preview.key }
}
