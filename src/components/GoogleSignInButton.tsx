import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'

interface CredentialResponse {
    credential?: string
}

interface GoogleSignInButtonProps {
    onSuccess: (credentialResponse: CredentialResponse) => void
    onError: () => void
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <GoogleLogin
                onSuccess={onSuccess}
                onError={onError}
                useOneTap={false}
                shape="square"
            />
        </GoogleOAuthProvider>
    )
}
