import { useEffect, useState } from 'react'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { apiFetch } from '../utils/api'

const defaultDestination = import.meta.env.DEV ? '/space/app/' : 'https://space.entropydrop.com/'
const fallbackDestination = import.meta.env.VITE_SPACE_URL || defaultDestination

function redirectWithToken(target: string, token: string | null) {
  try {
    const url = new URL(target, window.location.href)
    if (token && url.origin !== window.location.origin) {
      url.hash = `token=${encodeURIComponent(token)}`
    }
    window.location.replace(url.toString())
  } catch {
    window.location.replace(target)
  }
}

export function SpaceLoginPage() {
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const destination = searchParams?.get('destination') || fallbackDestination

  useEffect(() => {
    let active = true
    apiFetch('/api/auth/refresh', { method: 'POST', credentials: 'include', skipGlobalError: true })
      .then(async response => {
        if (active && response.ok) {
          const data = await response.json().catch(() => null)
          const token = (typeof data?.access_token === 'string' && data.access_token) || localStorage.getItem('token')
          if (token) localStorage.setItem('token', token)
          redirectWithToken(destination, token)
        }
      })
      .catch(() => { if (active) setError('暂时无法连接账户服务，请重试。 / Account service unavailable.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [destination])

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
      localStorage.setItem('token', data.access_token)
      window.dispatchEvent(new Event('auth-token-updated'))
      redirectWithToken(destination, data.access_token)
    } catch {
      setError('登录失败，请重试。 / Login failed. Please try again.')
      setChecking(false)
    }
  }
  return <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
    <h1 className="text-3xl font-bold">EntropyDrop Space</h1>
    <p>登录 EntropyDrop 账号后进入 Space。<br />Sign in to continue to Space.</p>
    {checking ? <p role="status">正在连接… / Connecting…</p> : <GoogleSignInButton onSuccess={login} onError={() => setError('登录失败 / Login failed')} />}
    {error && <p role="alert">{error}</p>}
    <a href="/space/intro">返回介绍页 / Back to introduction</a>
  </main>
}
