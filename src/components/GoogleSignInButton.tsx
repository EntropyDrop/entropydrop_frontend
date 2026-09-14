import { useState, useEffect } from 'react'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { API_BASE_URL } from '../utils/apiConfig'

interface CredentialResponse {
    credential?: string
}

interface GoogleSignInButtonProps {
    onSuccess: (credentialResponse: CredentialResponse) => void
    onError: () => void
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
    const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '')
    const [configError, setConfigError] = useState(false)

    useEffect(() => {
        if (clientId) return
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 5000)
        let active = true
        void fetch(`${API_BASE_URL}/api/auth/config`, { signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Account configuration unavailable')
                const data = await response.json()
                if (!data.google_client_id) throw new Error('Google login is not configured')
                if (active) setClientId(data.google_client_id)
            })
            .catch(() => { if (active) setConfigError(true) })
            .finally(() => window.clearTimeout(timeout))
        return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
    }, [clientId])

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    if (configError) return <span role="alert">Google 登录暂时不可用 / Google sign-in unavailable</span>
    if (!clientId) return <span role="status">正在加载 Google 登录… / Loading Google sign-in…</span>

    return (
        <GoogleOAuthProvider clientId={clientId} onScriptLoadError={onError}>
            <GoogleLogin
                onSuccess={onSuccess}
                onError={onError}
                useOneTap={false}
                shape="square"
                size={isMobile ? "medium" : "large"}
                text="signin"
            />
        </GoogleOAuthProvider>
    )
}
