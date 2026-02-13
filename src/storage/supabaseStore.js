const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const APARTMENT_KEY = 'power-split'
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const getHeaders = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
})

export const loadState = async () => {
  const url = `${supabaseUrl}/rest/v1/apartments?key=eq.${encodeURIComponent(APARTMENT_KEY)}&select=key,data&limit=1`
  const response = await fetch(url, { method: 'GET', headers: getHeaders() })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Load failed: ${response.status} ${message}`)
  }

  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return null
  return {
    key: rows[0]?.key ?? null,
    data: rows[0]?.data ?? null,
  }
}

export const saveState = async (appState, options = {}) => {
  const { insertOnly = false } = options
  const payload = [
    {
      key: APARTMENT_KEY,
      data: appState,
    },
  ]

  const preferHeader = insertOnly ? 'return=minimal' : 'resolution=merge-duplicates,return=minimal'
  const response = await fetch(`${supabaseUrl}/rest/v1/apartments`, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: preferHeader,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Save failed: ${response.status} ${message}`)
  }
}
