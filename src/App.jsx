import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'power-split-communal-v1'

const DISTRIBUTION_EQUAL = 'equal'
const DISTRIBUTION_PROPORTIONAL = 'proportional'

const DEFAULT_STATE = {
  tariffDay: 0,
  tariffNight: 0,
  meterA: {
    dayPrev: '',
    dayCurr: '',
    nightPrev: '',
    nightCurr: '',
  },
  meterB: {
    prev: '',
    curr: '',
  },
  meterC: {
    prev: '',
    curr: '',
  },
  distributionMode: DISTRIBUTION_EQUAL,
}

const parseNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const usage = (prev, curr) => Math.max(0, parseNumber(curr) - parseNumber(prev))
const isLowerThanPrev = (prev, curr) => prev !== '' && curr !== '' && parseNumber(curr) < parseNumber(prev)
const formatMoney = (value) => `${value.toFixed(2)} ₽`
const formatKwh = (value) => `${value.toFixed(2)} кВт⋅ч`

const roomTitles = ['Комната 1', 'Комната 2', 'Комната 3', 'Комната 4']

function App() {
  const [state, setState] = useState(DEFAULT_STATE)
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return

      setState({
        tariffDay: parseNumber(parsed.tariffDay),
        tariffNight: parseNumber(parsed.tariffNight),
        meterA: {
          dayPrev: parsed?.meterA?.dayPrev ?? '',
          dayCurr: parsed?.meterA?.dayCurr ?? '',
          nightPrev: parsed?.meterA?.nightPrev ?? '',
          nightCurr: parsed?.meterA?.nightCurr ?? '',
        },
        meterB: {
          prev: parsed?.meterB?.prev ?? '',
          curr: parsed?.meterB?.curr ?? '',
        },
        meterC: {
          prev: parsed?.meterC?.prev ?? '',
          curr: parsed?.meterC?.curr ?? '',
        },
        distributionMode:
          parsed.distributionMode === DISTRIBUTION_PROPORTIONAL
            ? DISTRIBUTION_PROPORTIONAL
            : DISTRIBUTION_EQUAL,
      })
    } catch {
      setState(DEFAULT_STATE)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!copyStatus) return undefined
    const timer = setTimeout(() => setCopyStatus(''), 1800)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const metrics = useMemo(() => {
    const A_day = usage(state.meterA.dayPrev, state.meterA.dayCurr)
    const A_night = usage(state.meterA.nightPrev, state.meterA.nightCurr)
    const A_total = A_day + A_night

    const B_total = usage(state.meterB.prev, state.meterB.curr)
    const C_total = usage(state.meterC.prev, state.meterC.curr)

    const base = [B_total / 2, B_total / 2, C_total / 2, C_total / 2]
    const Common_kwh = Math.max(0, A_total - (B_total + C_total))

    let commonShares = [Common_kwh / 4, Common_kwh / 4, Common_kwh / 4, Common_kwh / 4]
    if (state.distributionMode === DISTRIBUTION_PROPORTIONAL) {
      const sumWeights = base.reduce((sum, item) => sum + item, 0)
      commonShares =
        sumWeights > 0
          ? base.map((weight) => (Common_kwh * weight) / sumWeights)
          : [Common_kwh / 4, Common_kwh / 4, Common_kwh / 4, Common_kwh / 4]
    }

    const dayShare = A_total === 0 ? 0.5 : A_day / A_total
    const nightShare = 1 - dayShare
    const pricePerKwh = dayShare * parseNumber(state.tariffDay) + nightShare * parseNumber(state.tariffNight)

    const rooms = roomTitles.map((name, index) => {
      const roomKwh = base[index] + commonShares[index]
      const roomCost = roomKwh * pricePerKwh
      return {
        name,
        baseKwh: base[index],
        commonKwh: commonShares[index],
        totalKwh: roomKwh,
        cost: roomCost,
      }
    })

    const Rooms_total = rooms.reduce((sum, room) => sum + room.totalKwh, 0)
    const Total_rub = rooms.reduce((sum, room) => sum + room.cost, 0)

    return {
      A_day,
      A_night,
      A_total,
      B_total,
      C_total,
      Common_kwh,
      dayShare,
      nightShare,
      pricePerKwh,
      rooms,
      Rooms_total,
      Total_rub,
    }
  }, [state])

  const errors = {
    aDay: isLowerThanPrev(state.meterA.dayPrev, state.meterA.dayCurr),
    aNight: isLowerThanPrev(state.meterA.nightPrev, state.meterA.nightCurr),
    b: isLowerThanPrev(state.meterB.prev, state.meterB.curr),
    c: isLowerThanPrev(state.meterC.prev, state.meterC.curr),
  }

  const setField = (path, value) => {
    setState((prev) => {
      const next = structuredClone(prev)
      let cursor = next
      for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]]
      cursor[path[path.length - 1]] = value
      return next
    })
  }

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY)
    setState(DEFAULT_STATE)
    setCopyStatus('')
  }

  const handleCopyReport = async () => {
    const report = [
      '🧾 Power Split',
      `☀️/🌙 Тарифы: день ${formatMoney(parseNumber(state.tariffDay))}, ночь ${formatMoney(parseNumber(state.tariffNight))}`,
      `⚡️ A: день ${formatKwh(metrics.A_day)}, ночь ${formatKwh(metrics.A_night)}, всего ${formatKwh(metrics.A_total)}`,
      `🏠 B (комн. 1–2): ${formatKwh(metrics.B_total)}`,
      `🏠 C (комн. 3–4): ${formatKwh(metrics.C_total)}`,
      `Распределение общих: ${state.distributionMode === DISTRIBUTION_EQUAL ? 'поровну' : 'пропорционально'}`,
      `Общие кВт⋅ч: ${formatKwh(metrics.Common_kwh)}`,
      ...metrics.rooms.map(
        (room) =>
          `${room.name}: ${formatKwh(room.totalKwh)} = ${formatMoney(room.cost)} (база ${formatKwh(room.baseKwh)} + общие ${formatKwh(room.commonKwh)})`,
      ),
      `Итого: ${formatMoney(metrics.Total_rub)}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(report)
      setCopyStatus('Скопировано')
    } catch {
      setCopyStatus('Не удалось скопировать')
    }
  }

  return (
    <main className="app">
      <section className="card">
        <h1>⚡️ Power Split</h1>
        <p className="subtitle">Расчёт оплаты электроэнергии для коммунальной квартиры (4 комнаты).</p>

        <div className="grid">
          <section className="panel">
            <h2>☀️🌙 Тарифы</h2>
            <div className="field-grid">
              <label>
                День (₽/кВт⋅ч)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.tariffDay}
                  onChange={(e) => setField(['tariffDay'], e.target.value)}
                />
              </label>
              <label>
                Ночь (₽/кВт⋅ч)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.tariffNight}
                  onChange={(e) => setField(['tariffNight'], e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <h2>⚡️ Счётчик A (общий)</h2>
            <div className="subhead">☀️ День</div>
            <div className="field-grid two-cols">
              <label>
                Предыдущее
                <input
                  className={errors.aDay ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterA.dayPrev}
                  onChange={(e) => setField(['meterA', 'dayPrev'], e.target.value)}
                />
              </label>
              <label>
                Текущее
                <input
                  className={errors.aDay ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterA.dayCurr}
                  onChange={(e) => setField(['meterA', 'dayCurr'], e.target.value)}
                />
              </label>
            </div>
            {errors.aDay && <p className="error-text">Текущее меньше предыдущего</p>}

            <div className="subhead">🌙 Ночь</div>
            <div className="field-grid two-cols">
              <label>
                Предыдущее
                <input
                  className={errors.aNight ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterA.nightPrev}
                  onChange={(e) => setField(['meterA', 'nightPrev'], e.target.value)}
                />
              </label>
              <label>
                Текущее
                <input
                  className={errors.aNight ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterA.nightCurr}
                  onChange={(e) => setField(['meterA', 'nightCurr'], e.target.value)}
                />
              </label>
            </div>
            {errors.aNight && <p className="error-text">Текущее меньше предыдущего</p>}
          </section>

          <section className="panel">
            <h2>🏠 Счётчик B (комнаты 1–2)</h2>
            <div className="field-grid two-cols">
              <label>
                Предыдущее
                <input
                  className={errors.b ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterB.prev}
                  onChange={(e) => setField(['meterB', 'prev'], e.target.value)}
                />
              </label>
              <label>
                Текущее
                <input
                  className={errors.b ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterB.curr}
                  onChange={(e) => setField(['meterB', 'curr'], e.target.value)}
                />
              </label>
            </div>
            {errors.b && <p className="error-text">Текущее меньше предыдущего</p>}
          </section>

          <section className="panel">
            <h2>🏠 Счётчик C (комнаты 3–4)</h2>
            <div className="field-grid two-cols">
              <label>
                Предыдущее
                <input
                  className={errors.c ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterC.prev}
                  onChange={(e) => setField(['meterC', 'prev'], e.target.value)}
                />
              </label>
              <label>
                Текущее
                <input
                  className={errors.c ? 'input-error' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.meterC.curr}
                  onChange={(e) => setField(['meterC', 'curr'], e.target.value)}
                />
              </label>
            </div>
            {errors.c && <p className="error-text">Текущее меньше предыдущего</p>}
          </section>
        </div>

        <section className="panel">
          <h2>⚙️ Распределение общих расходов</h2>
          <div className="toggle-group">
            <label className="toggle-option">
              <input
                type="radio"
                name="distributionMode"
                checked={state.distributionMode === DISTRIBUTION_EQUAL}
                onChange={() => setField(['distributionMode'], DISTRIBUTION_EQUAL)}
              />
              Поровну по 4 комнатам
            </label>
            <label className="toggle-option">
              <input
                type="radio"
                name="distributionMode"
                checked={state.distributionMode === DISTRIBUTION_PROPORTIONAL}
                onChange={() => setField(['distributionMode'], DISTRIBUTION_PROPORTIONAL)}
              />
              Пропорционально потреблению
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>📋 Результаты по комнатам</h2>

          <div className="rooms-table">
            <table>
              <thead>
                <tr>
                  <th>Комната</th>
                  <th>База</th>
                  <th>Общие</th>
                  <th>Итог кВт⋅ч</th>
                  <th>Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rooms.map((room) => (
                  <tr key={room.name}>
                    <td>{room.name}</td>
                    <td>{room.baseKwh.toFixed(2)}</td>
                    <td>{room.commonKwh.toFixed(2)}</td>
                    <td>{room.totalKwh.toFixed(2)}</td>
                    <td>{formatMoney(room.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rooms-cards">
            {metrics.rooms.map((room) => (
              <article className="room-card" key={`mobile-${room.name}`}>
                <h3>{room.name}</h3>
                <p>База: {formatKwh(room.baseKwh)}</p>
                <p>Общие: {formatKwh(room.commonKwh)}</p>
                <p>Итог: {formatKwh(room.totalKwh)}</p>
                <p>Стоимость: {formatMoney(room.cost)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>🧾 Итоги</h2>
          <div className="summary-grid">
            <p>A_day: {formatKwh(metrics.A_day)}</p>
            <p>A_night: {formatKwh(metrics.A_night)}</p>
            <p>A_total: {formatKwh(metrics.A_total)}</p>
            <p>Rooms_total: {formatKwh(metrics.Rooms_total)}</p>
            <p>Common_kwh: {formatKwh(metrics.Common_kwh)}</p>
            <p>Цена 1 кВт⋅ч: {formatMoney(metrics.pricePerKwh)}</p>
            <p>Доля дня: {(metrics.dayShare * 100).toFixed(1)}%</p>
            <p>Доля ночи: {(metrics.nightShare * 100).toFixed(1)}%</p>
            <p className="summary-total">Total ₽: {formatMoney(metrics.Total_rub)}</p>
          </div>
        </section>

        <div className="actions">
          <button type="button" className="btn secondary" onClick={handleCopyReport}>
            📋 Скопировать отчёт
          </button>
          <button type="button" className="btn danger" onClick={resetAll}>
            Сбросить
          </button>
        </div>
        {copyStatus && <p className="copy-status">{copyStatus}</p>}
      </section>
    </main>
  )
}

export default App
