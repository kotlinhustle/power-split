import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'power-split-state'

const createMeter = (index = 1) => ({
  id: crypto.randomUUID(),
  name: `Счётчик ${index}`,
  previous: '',
  current: '',
})

const DEFAULT_TARIFF = 0

const parseNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const getUsage = (meter) => {
  const previous = parseNumber(meter.previous)
  const current = parseNumber(meter.current)
  return Math.max(0, current - previous)
}

function App() {
  const [tariff, setTariff] = useState(DEFAULT_TARIFF)
  const [meters, setMeters] = useState([createMeter(1)])

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
            name: typeof meter.name === 'string' ? meter.name : `Счётчик ${index + 1}`,
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

  const rows = useMemo(
    () =>
      meters.map((meter) => {
        const usage = getUsage(meter)
        const amount = usage * parseNumber(tariff)
        return { ...meter, usage, amount }
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
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Power Split</h1>
        <p className="subtitle">Калькулятор оплаты электроэнергии по нескольким счётчикам.</p>

        <div className="tariff-row">
          <label htmlFor="tariff">Тариф (₽/кВт⋅ч)</label>
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
                <th>Название</th>
                <th>Предыдущее</th>
                <th>Текущее</th>
                <th>Расход</th>
                <th>Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleMeterChange(row.id, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.previous}
                      onChange={(e) => handleMeterChange(row.id, 'previous', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.current}
                      onChange={(e) => handleMeterChange(row.id, 'current', e.target.value)}
                    />
                  </td>
                  <td>{row.usage.toFixed(2)}</td>
                  <td>{row.amount.toFixed(2)} ₽</td>
                  <td>
                    <button className="danger" type="button" onClick={() => removeMeter(row.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions">
          <button type="button" onClick={addMeter}>
            Добавить счётчик
          </button>
          <button type="button" className="danger" onClick={resetAll}>
            Сбросить
          </button>
        </div>

        <div className="totals">
          <p>
            Общий расход: <strong>{totals.totalUsage.toFixed(2)} кВт⋅ч</strong>
          </p>
          <p>
            Общая сумма: <strong>{totals.totalAmount.toFixed(2)} ₽</strong>
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
