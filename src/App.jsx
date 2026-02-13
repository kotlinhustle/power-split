import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { hasCloudConfig, loadApartment, saveApartment } from './cloudStore'

const STORAGE_KEY = 'power-split-communal-v2'

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
  people: [1, 1, 1, 1],
}

const ROOM_NAMES = ['Комната 1', 'Комната 2', 'Комната 3', 'Комната 4']

const generateAccessKey = () => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const getKeyFromHash = () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return params.get('k')
}

const setKeyToHash = (key) => {
  const nextHash = `#k=${encodeURIComponent(key)}`
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`
  window.history.replaceState(null, '', nextUrl)
}

const parseNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const parsePeople = (value) => {
  const num = Math.floor(parseNumber(value))
  return num >= 0 ? num : 0
}

const usage = (prev, curr) => Math.max(0, parseNumber(curr) - parseNumber(prev))
const isLowerThanPrev = (prev, curr) => prev !== '' && curr !== '' && parseNumber(curr) < parseNumber(prev)
const formatMoney = (value) => `${value.toFixed(2)} ₽`
const formatKwh = (value) => `${value.toFixed(2)} кВт⋅ч`
const formatFamily = (family) => `${family.name}: людей ${family.people}, ${formatKwh(family.totalKwh)} = ${formatMoney(family.cost)}`

const normalizeState = (source) => {
  const restoredPeople = Array.isArray(source?.people) ? source.people.map((v) => parsePeople(v)).slice(0, 4) : []

  return {
    tariffDay: parseNumber(source?.tariffDay),
    tariffNight: parseNumber(source?.tariffNight),
    meterA: {
      dayPrev: source?.meterA?.dayPrev ?? '',
      dayCurr: source?.meterA?.dayCurr ?? '',
      nightPrev: source?.meterA?.nightPrev ?? '',
      nightCurr: source?.meterA?.nightCurr ?? '',
    },
    meterB: {
      prev: source?.meterB?.prev ?? '',
      curr: source?.meterB?.curr ?? '',
    },
    meterC: {
      prev: source?.meterC?.prev ?? '',
      curr: source?.meterC?.curr ?? '',
    },
    people: [0, 1, 2, 3].map((i) => (Number.isInteger(restoredPeople[i]) ? restoredPeople[i] : 1)),
  }
}

const getInviteLink = (key) => `${window.location.origin}${window.location.pathname}${window.location.search}#k=${encodeURIComponent(key)}`

function App() {
  const [state, setState] = useState(DEFAULT_STATE)
  const [copyStatus, setCopyStatus] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [syncStatus, setSyncStatus] = useState(hasCloudConfig ? 'Инициализация…' : 'Локальный режим')
  const [isBootstrapped, setIsBootstrapped] = useState(false)

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      if (!hasCloudConfig) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw && active) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              setState(normalizeState(parsed))
            }
          }
        } catch {
          if (active) setState(DEFAULT_STATE)
        } finally {
          if (active) setIsBootstrapped(true)
        }
        return
      }

      let key = getKeyFromHash()
      if (!key) {
        key = generateAccessKey()
        setKeyToHash(key)
      }
      if (!active) return

      setAccessKey(key)
      setSyncStatus('Загружаю…')

      try {
        const cloudData = await loadApartment(key)
        if (!active) return

        if (cloudData && typeof cloudData === 'object') {
          setState(normalizeState(cloudData))
        } else {
          await saveApartment(key, DEFAULT_STATE)
        }
        setSyncStatus('Синхронизировано')
      } catch {
        if (!active) return
        setSyncStatus('Ошибка')
      } finally {
        if (active) setIsBootstrapped(true)
      }
    }

    bootstrap()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isBootstrapped) return
    if (hasCloudConfig) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, isBootstrapped])

  useEffect(() => {
    if (!hasCloudConfig || !isBootstrapped || !accessKey) return undefined
    setSyncStatus('Сохраняю…')
    const timer = setTimeout(async () => {
      try {
        await saveApartment(accessKey, state)
        setSyncStatus('Синхронизировано')
      } catch {
        setSyncStatus('Ошибка')
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [state, accessKey, isBootstrapped])

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
    const Common_kwh = Math.max(0, A_total - (B_total + C_total))

    const peopleRaw = state.people.map((value) => parsePeople(value))
    const warnings = []

    const baseByRoom = [0, 0, 0, 0]
    const p1 = peopleRaw[0]
    const p2 = peopleRaw[1]
    const p3 = peopleRaw[2]
    const p4 = peopleRaw[3]

    if (p1 > 0 && p3 > 0) {
      baseByRoom[0] = B_total / 2
      baseByRoom[2] = B_total / 2
    } else if (p1 > 0 && p3 === 0) {
      baseByRoom[0] = B_total
    } else if (p1 === 0 && p3 > 0) {
      baseByRoom[2] = B_total
    } else {
      warnings.push('По счётчику B нет жильцов')
    }

    if (p2 > 0 && p4 > 0) {
      baseByRoom[1] = C_total / 2
      baseByRoom[3] = C_total / 2
    } else if (p2 > 0 && p4 === 0) {
      baseByRoom[1] = C_total
    } else if (p2 === 0 && p4 > 0) {
      baseByRoom[3] = C_total
    } else {
      warnings.push('По счётчику C нет жильцов')
    }

    const totalPeoplePositive = peopleRaw.reduce((sum, p) => (p > 0 ? sum + p : sum), 0)
    const commonShares =
      totalPeoplePositive === 0
        ? [0, 0, 0, 0]
        : peopleRaw.map((p) => (p > 0 ? (Common_kwh * p) / totalPeoplePositive : 0))

    if (totalPeoplePositive === 0) {
      warnings.push('Нет жильцов')
    }

    const dayShare = A_total === 0 ? 0.5 : A_day / A_total
    const nightShare = 1 - dayShare
    const pricePerKwh = dayShare * parseNumber(state.tariffDay) + nightShare * parseNumber(state.tariffNight)

    const rooms = ROOM_NAMES.map((name, index) => {
      const isOccupied = peopleRaw[index] > 0
      const baseKwh = isOccupied ? baseByRoom[index] : 0
      const commonKwh = isOccupied ? commonShares[index] : 0
      const totalKwh = isOccupied ? baseKwh + commonKwh : 0
      const cost = isOccupied ? totalKwh * pricePerKwh : 0

      return {
        name,
        people: peopleRaw[index],
        baseKwh,
        commonKwh,
        totalKwh,
        cost,
      }
    })

    const families = [
      {
        name: 'Тётя Ира и Сергей',
        people: rooms[0].people + rooms[2].people,
        totalKwh: rooms[0].totalKwh + rooms[2].totalKwh,
        cost: rooms[0].cost + rooms[2].cost,
      },
      {
        name: 'Комната 2',
        people: rooms[1].people,
        totalKwh: rooms[1].totalKwh,
        cost: rooms[1].cost,
      },
      {
        name: 'Комната 4',
        people: rooms[3].people,
        totalKwh: rooms[3].totalKwh,
        cost: rooms[3].cost,
      },
    ]

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
      families,
      totalPeople: peopleRaw.reduce((sum, p) => sum + p, 0),
      Rooms_total,
      Total_rub,
      warnings,
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

  const setPeople = (index, value) => {
    setState((prev) => {
      const next = structuredClone(prev)
      next.people[index] = parsePeople(value)
      return next
    })
  }

  const resetAll = () => {
    if (!hasCloudConfig) {
      localStorage.removeItem(STORAGE_KEY)
    }
    setState(DEFAULT_STATE)
    setCopyStatus('')
  }

  const handleCopyReport = async () => {
    const report = [
      '🧾 Power Split',
      `☀️/🌙 Тарифы: день ${formatMoney(parseNumber(state.tariffDay))}, ночь ${formatMoney(parseNumber(state.tariffNight))}`,
      `⚡️ A: день ${formatKwh(metrics.A_day)}, ночь ${formatKwh(metrics.A_night)}, всего ${formatKwh(metrics.A_total)}`,
      `🏠 B (комнаты 1 и 3): ${formatKwh(metrics.B_total)}`,
      `🏠 C (комнаты 2 и 4): ${formatKwh(metrics.C_total)}`,
      `Общие кВт⋅ч: ${formatKwh(metrics.Common_kwh)}`,
      'Семьи:',
      ...metrics.families.map((family) => `- ${formatFamily(family)}`),
      'Комнаты:',
      ...metrics.rooms.map(
        (room) =>
          `${room.name}: людей ${room.people}, база ${formatKwh(room.baseKwh)}, общие ${formatKwh(room.commonKwh)}, итого ${formatKwh(room.totalKwh)} = ${formatMoney(room.cost)}`,
      ),
      `Итого людей: ${metrics.totalPeople}`,
      `Итого: ${formatMoney(metrics.Total_rub)}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(report)
      setCopyStatus('Скопировано')
    } catch {
      setCopyStatus('Не удалось скопировать')
    }
  }

  const handleCopyInviteLink = async () => {
    if (!accessKey) {
      setCopyStatus('Ключ ещё не готов')
      return
    }
    try {
      await navigator.clipboard.writeText(getInviteLink(accessKey))
      setCopyStatus('Ссылка скопирована')
    } catch {
      setCopyStatus('Не удалось скопировать ссылку')
    }
  }

  return (
    <main className="app">
      <section className="card">
        <div className="cloud-bar">
          <p className="cloud-status">Статус: {syncStatus}</p>
          {accessKey && (
            <p className="cloud-link">
              Ссылка доступа: <button type="button" className="link-btn" onClick={handleCopyInviteLink}>Copy</button>
            </p>
          )}
        </div>

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
            <h2>🏠 Счётчик B (комнаты 1 и 3)</h2>
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
            <h2>🏠 Счётчик C (комнаты 2 и 4)</h2>
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
          <h2>👥 Сколько человек в комнатах</h2>
          <div className="field-grid people-grid">
            {ROOM_NAMES.map((room, index) => (
              <label key={room}>
                {room}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={state.people[index]}
                  onChange={(e) => setPeople(index, e.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        {metrics.warnings.length > 0 && (
          <section className="panel warning-panel">
            <h2>⚠️ Предупреждения</h2>
            <ul className="warnings-list">
              {metrics.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel">
          <h2>🧾 Итоги по семьям</h2>
          <div className="family-table">
            <table>
              <thead>
                <tr>
                  <th>Семья</th>
                  <th>Людей</th>
                  <th>Итого кВт⋅ч</th>
                  <th>Сумма ₽</th>
                </tr>
              </thead>
              <tbody>
                {metrics.families.map((family) => (
                  <tr key={family.name}>
                    <td>{family.name}</td>
                    <td>{family.people}</td>
                    <td>{family.totalKwh.toFixed(2)}</td>
                    <td>{formatMoney(family.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="family-cards">
            {metrics.families.map((family) => (
              <article className="room-card" key={`family-${family.name}`}>
                <h3>{family.name}</h3>
                <p>Людей: {family.people}</p>
                <p>Итого: {formatKwh(family.totalKwh)}</p>
                <p>Сумма: {formatMoney(family.cost)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>📋 Результаты по комнатам</h2>

          <div className="rooms-table">
            <table>
              <thead>
                <tr>
                  <th>Комната</th>
                  <th>Людей</th>
                  <th>Базовые кВт⋅ч</th>
                  <th>Общие кВт⋅ч</th>
                  <th>Итого кВт⋅ч</th>
                  <th>Сумма ₽</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rooms.map((room) => (
                  <tr key={room.name}>
                    <td>{room.name}</td>
                    <td>{room.people}</td>
                    <td>{room.baseKwh.toFixed(2)}</td>
                    <td>{room.commonKwh.toFixed(2)}</td>
                    <td>{room.totalKwh.toFixed(2)}</td>
                    <td>{formatMoney(room.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Итого</td>
                  <td>{metrics.totalPeople}</td>
                  <td>-</td>
                  <td>{metrics.Common_kwh.toFixed(2)}</td>
                  <td>{metrics.Rooms_total.toFixed(2)}</td>
                  <td>{formatMoney(metrics.Total_rub)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rooms-cards">
            {metrics.rooms.map((room) => (
              <article className="room-card" key={`mobile-${room.name}`}>
                <h3>{room.name}</h3>
                <p>Людей: {room.people}</p>
                <p>Базовые: {formatKwh(room.baseKwh)}</p>
                <p>Общие: {formatKwh(room.commonKwh)}</p>
                <p>Итого: {formatKwh(room.totalKwh)}</p>
                <p>Сумма: {formatMoney(room.cost)}</p>
              </article>
            ))}
            <article className="room-card room-card-total">
              <h3>Итого</h3>
              <p>Людей: {metrics.totalPeople}</p>
              <p>Common_kwh: {formatKwh(metrics.Common_kwh)}</p>
              <p>Total ₽: {formatMoney(metrics.Total_rub)}</p>
            </article>
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
            <p>Людей всего: {metrics.totalPeople}</p>
            <p className="summary-total">Total ₽: {formatMoney(metrics.Total_rub)}</p>
          </div>
        </section>

        <div className="actions">
          <button type="button" className="btn secondary" onClick={handleCopyReport}>
            📋 Скопировать отчёт
          </button>
          <button type="button" className="btn secondary" onClick={handleCopyInviteLink}>
            🔗 Скопировать ссылку приглашение
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
