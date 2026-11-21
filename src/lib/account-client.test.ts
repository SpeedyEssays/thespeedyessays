import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isGoogleSignInEnabled,
  readSupabaseAccountLink,
  recoverPassword,
  resendSignupConfirmation,
  signInWithGoogle,
} from './account-client'

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  resend: vi.fn(),
  signInWithOAuth: vi.fn(),
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

describe('Google sign-in', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.replaceState(null, '', '/account')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('checks whether the Google provider is enabled', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    fetch
      .mockResolvedValueOnce(Response.json({ external: { google: false } }))
      .mockResolvedValueOnce(Response.json({ external: { google: true } }))
      .mockRejectedValueOnce(new Error('Network error'))

    await expect(isGoogleSignInEnabled()).resolves.toBe(false)
    await expect(isGoogleSignInEnabled()).resolves.toBe(true)
    await expect(isGoogleSignInEnabled()).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://example.test/auth/v1/settings'),
      expect.objectContaining({ headers: { apikey: 'publishable-test-key' } }),
    )
  })

  it('starts Google sign-in and preserves the requested order destination', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null })
    await signInWithGoogle('/order?pages=4&deadline=7d')

    const [request] = auth.signInWithOAuth.mock.calls[0]
    const redirect = new URL(request.options.redirectTo)
    expect(request.provider).toBe('google')
    expect(redirect.origin).toBe(window.location.origin)
    expect(redirect.pathname).toBe('/account')
    expect(redirect.searchParams.get('google')).toBe('true')
    expect(redirect.searchParams.get('next')).toBe('/order?pages=4&deadline=7d')
  })

  it('exchanges a Google code and removes it from the account URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/account?google=true&next=%2Forder&code=google-code&sb_flow_id=google-flow',
    )
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user, session: {} },
      error: null,
    })

    await expect(readSupabaseAccountLink()).resolves.toEqual({
      mode: 'signed-in',
    })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('google-code', {
      flowId: 'google-flow',
    })
    expect(window.location.search).toBe('?next=%2Forder')
  })

  it('clears an abandoned Google callback and leaves email sign-in available', async () => {
    window.history.replaceState(
      null,
      '',
      '/account?google=true&error=access_denied',
    )
    await expect(readSupabaseAccountLink()).rejects.toThrow(
      'Invalid or expired account link.',
    )
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})

describe('account email links', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.replaceState(null, '', '/account')
  })

  it.each([
    ['email', { mode: 'signed-in' }],
    ['magiclink', { mode: 'signed-in' }],
    ['recovery', { mode: 'reset', userId: user.id, email: user.email }],
    ['invite', { mode: 'reset', userId: user.id, email: user.email }],
    ['email_change', { mode: 'email-change', pending: false }],
  ])('uses the %s token only after the recipient continues', async (type, result) => {
    window.history.replaceState(null, '', `/account#token_hash=one-time-hash&type=${type}`)
    auth.verifyOtp.mockResolvedValue({ data: { user, session: {} }, error: null })

    await expect(readSupabaseAccountLink()).resolves.toEqual({ mode: 'verify-email', type })
    expect(auth.verifyOtp).not.toHaveBeenCalled()

    await expect(readSupabaseAccountLink({ confirmEmailLink: true })).resolves.toEqual(result)
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type, token_hash: 'one-time-hash' })
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it('recognizes the first of two confirmations for an email address change', async () => {
    window.history.replaceState(null, '', '/account?token_hash=one-time-hash&type=email_change')
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null })

    await expect(readSupabaseAccountLink({ confirmEmailLink: true })).resolves.toEqual({
      mode: 'email-change',
      pending: true,
    })
    expect(window.location.search).toBe('')
  })

  it('clears a failed confirmation token from the account page', async () => {
    window.history.replaceState(null, '', '/account#token_hash=expired&type=email')
    auth.verifyOtp.mockResolvedValue({ error: new Error('Expired link') })

    await expect(readSupabaseAccountLink({ confirmEmailLink: true })).rejects.toThrow('Expired link')
    expect(window.location.hash).toBe('')
  })
})

describe('resending signup confirmation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('requests a new link for the existing signup using the account page', async () => {
    auth.resend.mockResolvedValue({ error: null })

    await resendSignupConfirmation('customer@example.test')

    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'customer@example.test',
      options: { emailRedirectTo: `${window.location.origin}/account` },
    })
  })

  it('reports a delivery failure when Supabase rejects the request', async () => {
    const error = Object.assign(new Error('Error sending confirmation email'), {
      status: 500,
      code: 'unexpected_failure',
    })
    auth.resend.mockResolvedValue({ error })

    await expect(resendSignupConfirmation('customer@example.test')).rejects.toBe(error)
  })
})

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
