const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasCloudConfig = Boolean(supabaseUrl && supabaseAnonKey)

const getHeaders = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
})

export const loadApartment = async (key) => {
  const url = `${supabaseUrl}/rest/v1/apartments?key=eq.${encodeURIComponent(key)}&select=data&limit=1`
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Load failed: ${response.status} ${message}`)
  }

  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0]?.data ?? null
}

export const saveApartment = async (key, data) => {
  const payload = [
    {
      key,
      data,
      updated_at: new Date().toISOString(),
    },
  ]

  const response = await fetch(`${supabaseUrl}/rest/v1/apartments`, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Save failed: ${response.status} ${message}`)
  }
}
