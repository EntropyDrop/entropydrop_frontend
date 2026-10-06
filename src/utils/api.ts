import { API_BASE_URL } from './apiConfig'
import { request, type RequestOptions } from './httpClient'
import { getAuthSessionKey, subscribeAuthSession } from './authSession'
import { waitForAuthReady } from './authClient'
import { SharedRequestCache } from './sharedRequestCache'
export { API_BASE_URL } from './apiConfig'

type ResponseSnapshot = { body: string; status: number; statusText: string; headers: Headers }
const responseScopes = new WeakMap<Response, { session: string | null; signal?: AbortSignal | null; public: boolean }>()
function trackResponse(response: Response, options: ApiRequestOptions) {
    responseScopes.set(response, { session: getAuthSessionKey(), signal: options.signal, public: options.auth === 'none' })
    return response
}
const queries = new SharedRequestCache<ResponseSnapshot>(value => value.body.length * 2)
let session: string | null | undefined
let observing = false
function syncQueryScope() {
    const next = getAuthSessionKey()
    if (next !== session) { session = next; queries.clear() }
    if (!observing && typeof window !== 'undefined') {
        observing = true
        subscribeAuthSession(syncQueryScope)
        window.addEventListener('user-updated', () => queries.clear())
    }
}

export interface ApiRequestOptions extends RequestOptions { cacheTtlMs?: number }

export function invalidateApiQueries() { queries.clear() }

export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    if (options.auth === 'required' || path.startsWith('/api/users/me')) await waitForAuthReady()
    syncQueryScope()
    const url = /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
    const headers = new Headers(options.headers)
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }
    const { cacheTtlMs, ...requestOptions } = options
    const isGet = !options.method || options.method.toUpperCase() === 'GET'
    const ttl = options.cache === 'no-store' ? 0 : cacheTtlMs ?? (path === '/api/users/me' ? 15_000 : 0)
    if (!isGet || ttl <= 0) {
        const expectedSession = getAuthSessionKey()
        const response = await request(url, { ...requestOptions, headers })
        options.signal?.throwIfAborted()
        const sessionControl = /\/api\/auth\/(?:google|refresh|logout|config)\/?$/.test(new URL(url, window.location.href).pathname)
        if (options.auth !== 'none' && !sessionControl && expectedSession !== getAuthSessionKey()) {
            throw new DOMException('Session changed', 'AbortError')
        }
        if (!isGet && response.ok) queries.clear()
        return trackResponse(response, options)
    }
    const expectedSession = getAuthSessionKey()
    const key = JSON.stringify([url, expectedSession, Array.from(headers.entries()), options.credentials ?? 'include', options.auth === 'none' ? 'none' : 'session', !!options.skipGlobalError])
    const snapshot = await queries.get(key, ttl, async signal => {
        const response = await request(url, { ...requestOptions, headers, signal })
        if (!response.ok) throw response
        const body = await response.text()
        signal.throwIfAborted()
        return { body, status: response.status, statusText: response.statusText, headers: response.headers }
    }, options.signal ?? undefined).catch(error => {
        if (error instanceof Response) return error
        throw error
    })
    if (options.auth !== 'none' && expectedSession !== getAuthSessionKey()) throw new DOMException('Session changed', 'AbortError')
    if (snapshot instanceof Response) return trackResponse(snapshot.clone(), options)
    return trackResponse(new Response(snapshot.body, { status: snapshot.status, statusText: snapshot.statusText, headers: snapshot.headers }), options)
}

/** Use this when a caller needs to inspect status before decoding a JSON body. */
export async function apiResponseJson(response: Response) {
    const data = await response.json()
    const scope = responseScopes.get(response)
    scope?.signal?.throwIfAborted()
    if (scope && !scope.public && scope.session !== getAuthSessionKey()) throw new DOMException('Session changed', 'AbortError')
    return data
}

export async function apiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await apiFetch(path, options)
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    return apiResponseJson(response) as Promise<T>
}
