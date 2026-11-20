import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readSupabaseAccountLink, recoverPassword } from './account-client'

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('@netlify/identity', () => ({
  acceptInvite: vi.fn(),
  handleAuthCallback: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth }) }))
vi.mock('./supabase-config', () => ({
  useSupabase: true,
  supabaseConfig: () => ({
    url: 'https://example.test',
    key: 'publishable-test-key',
  }),
}))

const user = {
  id: 'staff-account',
  email: 'staff@example.test',
  app_metadata: { roles: ['admin'] },
}

describe('password recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.replaceState(null, '', '/account')
  })

  it('requires a new, valid recovery code even with a previously signed-in account', async () => {
    window.history.replaceState(
      null,
      '',
      '/account?recovery=true&code=expired&sb_flow_id=test-flow',
    )
    auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error('Expired link'),
    })
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'customer-account' } },
    })

    await expect(readSupabaseAccountLink()).rejects.toThrow('Expired link')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('expired', {
      flowId: 'test-flow',
    })
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('opens password reset for the verified account and returns staff after saving', async () => {
    window.history.replaceState(null, '', '/account?recovery=true&code=fresh')
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user, session: {} },
      error: null,
    })
    auth.getUser.mockResolvedValue({ data: { user }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user }, error: null })

    const link = await readSupabaseAccountLink()
    expect(link).toEqual({ mode: 'reset', userId: user.id, email: user.email })
    await expect(
      recoverPassword('', 'unique-test-password', user.id),
    ).resolves.toBe(true)
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: 'unique-test-password',
    })
  })

  it('leaves the other account untouched if the browser session changes', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'customer-account' } },
    })

    await expect(
      recoverPassword('', 'unique-test-password', user.id),
    ).rejects.toMatchObject({
      code: 'recovery_session_changed',
    })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a denied link from the provider and clears the callback', async () => {
    window.history.replaceState(
      null,
      '',
      '/account#error=access_denied&error_code=otp_expired',
    )
    await expect(readSupabaseAccountLink()).rejects.toThrow(
      'Invalid or expired account link.',
    )
    expect(window.location.hash).toBe('')
  })
})
