import { useState, useEffect } from 'react'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'

interface CredentialResponse {
    credential?: string
}

interface GoogleSignInButtonProps {
    onSuccess: (credentialResponse: CredentialResponse) => void
    onError: () => void
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640)

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
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
