import { useEffect, useState } from 'react'
import { LatestRequest } from '../utils/latestRequest'

export function useLatestRequest() {
    const [request] = useState(() => new LatestRequest())
    useEffect(() => () => request.cancel(), [request])
    return request
}
