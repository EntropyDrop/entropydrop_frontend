import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { PageContainer } from '../components/PageContainer'
import { apiFetch } from '../utils/api'
import type { LangData } from '../constants/lang'

const defaultDestination = import.meta.env.DEV ? '/space/app/' : 'https://space.entropydrop.com/'
const fallbackDestination = import.meta.env.VITE_SPACE_URL || defaultDestination

function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length < 2) return false
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded))
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 > Date.now() + 10000
    }
    return true
  } catch {
    return false
  }
}

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

interface SpaceLoginPageProps {
  current?: LangData
}

export function SpaceLoginPage({ current }: SpaceLoginPageProps) {
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const destination = searchParams?.get('destination') || fallbackDestination
  const fontClass = current?.fontClass || ''

  useEffect(() => {
    let active = true

    // 1. Fast-path: if local storage already has a valid unexpired token, redirect immediately
    const existingToken = localStorage.getItem('token')
    if (isTokenValid(existingToken)) {
      redirectWithToken(destination, existingToken)
      return
    }

    // 2. Otherwise, attempt session refresh via credentials
    apiFetch('/api/auth/refresh', { method: 'POST', credentials: 'include', skipGlobalError: true })
      .then(async response => {
        if (active && response.ok) {
          const data = await response.json().catch(() => null)
          const token = (typeof data?.access_token === 'string' && data.access_token) || localStorage.getItem('token')
          if (token && isTokenValid(token)) {
            localStorage.setItem('token', token)
            redirectWithToken(destination, token)
            return
          }
        }
      })
      .catch(() => {
        if (active) setError('暂时无法连接账户服务，请稍后重试。 / Account service unavailable.')
      })
      .finally(() => {
        if (active) setChecking(false)
      })

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
          进入 Space 探索可编程体素世界前，请先登录 EntropyDrop 账号。<br />
          <span className="text-xs text-gray-400">Sign in to your EntropyDrop account before entering Space.</span>
        </p>
      </div>

      {checking ? (
        <div className="flex items-center justify-center gap-2.5 py-6 text-gray-400 text-sm" role="status">
          <Icon icon="pixelarticons:loader" className="animate-spin text-lg text-[#4ea632]" />
          <span>正在连接账户服务… / Connecting…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex justify-center my-1 scale-105">
            <GoogleSignInButton
              onSuccess={login}
              onError={() => setError('Google 登录失败，请重试 / Google login failed, please try again')}
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
              返回 Space 介绍页 / Back to Space Intro
            </a>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
