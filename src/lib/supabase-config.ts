export const useSupabase = import.meta.env.MODE === 'cloudflare'

export function supabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Customer accounts are not configured.')
  return { url, key }
}
