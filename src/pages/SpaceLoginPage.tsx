import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { PageContainer } from '../components/PageContainer'
import { apiFetch } from '../utils/api'
import { refreshAuthSession } from '../utils/fetchInterceptor'
import { isSpaceTokenValid, resolveSpaceDestination, spaceDestinationWithToken } from '../utils/spaceLogin'
import type { LangData } from '../constants/lang'

const defaultDestination = import.meta.env.DEV ? '/space/app/' : 'https://space.entropydrop.com/'
const fallbackDestination = import.meta.env.VITE_SPACE_URL || defaultDestination

interface SpaceLoginPageProps {
  current?: LangData
}

export function SpaceLoginPage({ current }: SpaceLoginPageProps) {
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const destination = resolveSpaceDestination(searchParams?.get('destination') || null, fallbackDestination, window.location.href).href
  const silent = searchParams?.get('silent') === '1'
  const reauthenticate = searchParams?.get('reauth') === '1'
  const fontClass = current?.fontClass || ''

  useEffect(() => {
    let active = true

    const redirect = (token: string | null) => {
      window.location.replace(spaceDestinationWithToken(new URL(destination), token, window.location.origin))
    }
    const existingToken = localStorage.getItem('token')
    if (!reauthenticate && isSpaceTokenValid(existingToken)) {
      redirect(existingToken)
      return
    }

    void refreshAuthSession().then(result => {
      if (!active) return
      if (isSpaceTokenValid(result.token)) {
        redirect(result.token)
      } else if (result.terminal) {
        localStorage.removeItem('token')
        window.dispatchEvent(new Event('auth-token-updated'))
        if (silent) redirect(null)
      } else {
        setError('Account service unavailable. Please try again later.')
      }
    }).finally(() => {
      if (active) setChecking(false)
    })

    return () => { active = false }
  }, [destination, silent, reauthenticate])

  const login = async ({ credential }: { credential?: string }) => {
    if (!credential) return
    setChecking(true)
    setError('')
    try {
      const response = await apiFetch('/api/auth/google', {
        method: 'POST', credentials: 'include', body: JSON.stringify({ token: credential }), skipGlobalError: true,
      })
      if (!response.ok) throw new Error('Login failed')
      const data = await response.json()
      if (!isSpaceTokenValid(data.access_token)) throw new Error('Invalid login response')
      localStorage.setItem('token', data.access_token)
      window.dispatchEvent(new Event('auth-token-updated'))
      window.location.replace(spaceDestinationWithToken(new URL(destination), data.access_token, window.location.origin))
    } catch {
      setError('Login failed. Please try again.')
      setChecking(false)
    }
  }

  return (
    <PageContainer maxWidth="max-w-md" height="h-auto" gap="gap-6" className="text-center items-center py-8 sm:py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-xl bg-[#3c8527]/20 border border-[#3c8527]/50 flex items-center justify-center text-[#4ea632] text-3xl shadow-[0_0_24px_rgba(60,133,39,0.35)]">
          <Icon icon="pixelarticons:cube" />
        </div>
        <h1 className={`text-2xl sm:text-3xl font-bold tracking-wide text-white m-0 ${fontClass}`}>
          EntropyDrop Space
        </h1>
        <p className="text-sm text-gray-300 max-w-sm m-0 leading-relaxed">
          Sign in to your EntropyDrop account before entering Space.
        </p>
      </div>

      {checking ? (
        <div className="flex items-center justify-center gap-2.5 py-6 text-gray-400 text-sm" role="status">
          <Icon icon="pixelarticons:loader" className="animate-spin text-lg text-[#4ea632]" />
          <span>Connecting to the account service…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex justify-center my-1 scale-105">
            <GoogleSignInButton
              onSuccess={login}
              onError={() => setError('Google sign-in failed. Please try again.')}
              configErrorText="Google sign-in is temporarily unavailable."
              loadingText="Loading Google sign-in…"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 px-3 py-1.5 rounded m-0">
              {error}
            </p>
          )}
          <div className="pt-2">
            <a
              href="/space/intro"
              className="inline-flex items-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs text-gray-300 hover:text-white transition-all no-underline"
            >
              <Icon icon="pixelarticons:arrow-left" />
              Back to Space Intro
            </a>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
