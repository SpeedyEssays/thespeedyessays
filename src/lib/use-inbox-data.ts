import { useEffect, useReducer, useState } from 'react'

export function useInboxData<T>(load: () => Promise<T>, interval = 10_000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [revision, refresh] = useReducer((value: number) => value + 1, 0)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        if (!document.hidden) {
          const rows = await load()
          if (active) {
            setData(rows)
            setError(false)
          }
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) timer = setTimeout(poll, interval)
      }
    }

    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [load, interval, revision])

  return { data, error, refresh }
}
