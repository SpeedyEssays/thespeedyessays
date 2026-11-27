import { useState } from 'react'
import { useSupabase } from '@/lib/supabase-config'
import { logout } from '@/lib/account-client'
import { Button } from '@/components/ui/button'

export function SignOut() {
  const [error, setError] = useState(false)
  if (useSupabase) {
    return (
      <form method="post" action="/api/sign-out">
        <Button variant="ghost" type="submit">
          Sign out
        </Button>
      </form>
    )
  }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={async () => {
          try {
            await logout()
            window.location.assign('/')
          } catch {
            setError(true)
          }
        }}
      >
        Sign out
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Sign-out failed. Try again.
        </p>
      )}
    </div>
  )
}
