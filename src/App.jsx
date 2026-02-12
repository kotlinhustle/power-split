import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'power-split-state'

const TEXT = {
  meter: '\u0421\u0447\u0451\u0442\u0447\u0438\u043A',
  title: 'Power Split',
  subtitle:
    '\u041a\u0430\u043b\u044c\u043a\u0443\u043b\u044f\u0442\u043e\u0440 \u043e\u043f\u043b\u0430\u0442\u044b \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u044d\u043d\u0435\u0440\u0433\u0438\u0438 \u043f\u043e \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u0438\u043c \u0441\u0447\u0451\u0442\u0447\u0438\u043a\u0430\u043c.',
  tariffLabel: '\u0422\u0430\u0440\u0438\u0444 (\u20bd/\u043a\u0412\u0442\u22c5\u0447)',
  name: '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435',
  previous: '\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0435',
  current: '\u0422\u0435\u043a\u0443\u0449\u0435\u0435',
  usage: '\u0420\u0430\u0441\u0445\u043e\u0434',
  amount: '\u0421\u0443\u043c\u043c\u0430',
  remove: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c',
  addMeter: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0447\u0451\u0442\u0447\u0438\u043a',
  copyResult: '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442',
  reset: '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c',
  tariffShort: '\u0422\u0430\u0440\u0438\u0444',
  totalUsage: '\u041e\u0431\u0449\u0438\u0439 \u0440\u0430\u0441\u0445\u043e\u0434',
  totalAmount: '\u041e\u0431\u0449\u0430\u044f \u0441\u0443\u043c\u043c\u0430',
  totalShort: '\u0418\u0442\u043e\u0433\u043e',
  unit: '\u043a\u0412\u0442\u22c5\u0447',
  invalid: '\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u043c\u0435\u043d\u044c\u0448\u0435 \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0433\u043e',
  placeholder: '\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 12345.6',
  copied: '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e',
  copyFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c',
}

const createMeter = (index = 1) => ({
  id: crypto.randomUUID(),
  name: `${TEXT.meter} ${index}`,
  previous: '',
  current: '',
})

const DEFAULT_TARIFF = 0

const parseNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const hasInvalidReading = (meter) => {
  if (meter.previous === '' || meter.current === '') return false
  const previous = Number(meter.previous)
  const current = Number(meter.current)
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false
  return current < previous
}

const formatRubles = (value) => `${value.toFixed(2)} \u20bd`

function App() {
  const [tariff, setTariff] = useState(DEFAULT_TARIFF)
  const [meters, setMeters] = useState([createMeter(1)])
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return

      const parsed = JSON.parse(saved)
      if (typeof parsed !== 'object' || parsed === null) return

      const restoredTariff = parseNumber(parsed.tariff)
      const restoredMeters = Array.isArray(parsed.meters)
        ? parsed.meters.map((meter, index) => ({
            id: meter.id || crypto.randomUUID(),
            name: typeof meter.name === 'string' ? meter.name : `${TEXT.meter} ${index + 1}`,
            previous: meter.previous ?? '',
            current: meter.current ?? '',
          }))
        : []

      setTariff(restoredTariff)
      setMeters(restoredMeters.length > 0 ? restoredMeters : [createMeter(1)])
    } catch {
      setTariff(DEFAULT_TARIFF)
      setMeters([createMeter(1)])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tariff,
        meters,
      }),
    )
  }, [tariff, meters])

  useEffect(() => {
    if (!copyStatus) return undefined
    const timer = setTimeout(() => setCopyStatus(''), 1800)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const rows = useMemo(
    () =>
      meters.map((meter) => {
        const previous = parseNumber(meter.previous)
        const current = parseNumber(meter.current)
        const hasError = hasInvalidReading(meter)
        const usage = hasError ? 0 : Math.max(0, current - previous)
        const amount = usage * parseNumber(tariff)

        return { ...meter, usage, amount, hasError }
      }),
    [meters, tariff],
  )

  const totals = useMemo(() => {
    const totalUsage = rows.reduce((sum, row) => sum + row.usage, 0)
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)

    return {
      totalUsage,
      totalAmount,
    }
  }, [rows])

  const handleMeterChange = (id, field, value) => {
    setMeters((prev) =>
      prev.map((meter) =>
        meter.id === id
          ? {
              ...meter,
              [field]: value,
            }
          : meter,
      ),
    )
  }

  const addMeter = () => {
    setMeters((prev) => [...prev, createMeter(prev.length + 1)])
  }

  const removeMeter = (id) => {
    setMeters((prev) => {
      const next = prev.filter((meter) => meter.id !== id)
      return next.length > 0 ? next : [createMeter(1)]
    })
  }

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY)
    setTariff(DEFAULT_TARIFF)
    setMeters([createMeter(1)])
    setCopyStatus('')
  }

  const handleCopyResult = async () => {
    const normalizedTariff = parseNumber(tariff)
    const meterParts = rows.map((row, index) => {
      const meterName = row.name?.trim() || `${TEXT.meter}${index + 1}`
      return `${meterName}: ${row.usage.toFixed(2)} ${TEXT.unit} = ${formatRubles(row.amount)}`
    })

    const resultText = [
      `${TEXT.tariffShort}: ${normalizedTariff.toFixed(2)} \u20bd/${TEXT.unit}`,
      ...meterParts,
      `${TEXT.totalShort}: ${formatRubles(totals.totalAmount)}`,
    ].join('; ')

    try {
      await navigator.clipboard.writeText(resultText)
      setCopyStatus(TEXT.copied)
    } catch {
      setCopyStatus(TEXT.copyFailed)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{TEXT.title}</h1>
        <p className="subtitle">{TEXT.subtitle}</p>

        <div className="tariff-row">
          <label htmlFor="tariff">{TEXT.tariffLabel}</label>
          <input
            id="tariff"
            type="number"
            step="0.01"
            min="0"
            value={tariff}
            onChange={(e) => setTariff(e.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{TEXT.name}</th>
                <th>{TEXT.previous}</th>
                <th>{TEXT.current}</th>
                <th>{TEXT.usage}</th>
                <th>{TEXT.amount}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.hasError ? 'invalid-row' : ''}>
                  <td>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleMeterChange(row.id, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <div className="reading-field">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={TEXT.placeholder}
                        value={row.previous}
                        onChange={(e) => handleMeterChange(row.id, 'previous', e.target.value)}
                      />
                      <span className="unit-label">{TEXT.unit}</span>
                    </div>
                  </td>
                  <td>
                    <div className="reading-field">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={TEXT.placeholder}
                        value={row.current}
                        onChange={(e) => handleMeterChange(row.id, 'current', e.target.value)}
                      />
                      <span className="unit-label">{TEXT.unit}</span>
                    </div>
                    {row.hasError && <div className="error-text">{TEXT.invalid}</div>}
                  </td>
                  <td>{row.usage.toFixed(2)}</td>
                  <td>{formatRubles(row.amount)}</td>
                  <td>
                    <button className="danger" type="button" onClick={() => removeMeter(row.id)}>
                      {TEXT.remove}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions">
          <button type="button" onClick={addMeter}>
            {TEXT.addMeter}
          </button>
          <button type="button" className="secondary" onClick={handleCopyResult}>
            {TEXT.copyResult}
          </button>
          <button type="button" className="danger" onClick={resetAll}>
            {TEXT.reset}
          </button>
        </div>

        {copyStatus && <p className="copy-status">{copyStatus}</p>}

        <div className="totals">
          <p>
            {TEXT.totalUsage}: <strong>{totals.totalUsage.toFixed(2)} {TEXT.unit}</strong>
          </p>
          <p>
            {TEXT.totalAmount}: <strong>{formatRubles(totals.totalAmount)}</strong>
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
