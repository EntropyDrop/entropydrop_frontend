import { Navigate } from 'react-router-dom'
import { FIGURE_PRINT_TERMS } from '../constants/figurePrintTerms'

// The 3D printing terms are now Section 18 of the Terms of Service; keep old links working.
export function FigurePrintTermsPage() {
    return <Navigate to={FIGURE_PRINT_TERMS.path} replace />
}
