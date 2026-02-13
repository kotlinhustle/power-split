import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { APARTMENT_KEY, hasSupabaseConfig, loadState, saveState } from './storage/supabaseStore'

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
  groups: [
    { id: 'family13', name: 'Тётя Ира и Сергей', roomIndexes: [0, 2] },
    { id: 'room2', name: 'Комната 2', roomIndexes: [1] },
    { id: 'room4', name: 'Комната 4', roomIndexes: [3] },
  ],
}

const ROOM_NAMES = ['Комната 1', 'Комната 2', 'Комната 3', 'Комната 4']

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
  const defaultGroups = DEFAULT_STATE.groups
  const restoredGroups = Array.isArray(source?.groups)
    ? source.groups
        .map((g, index) => ({
          id: typeof g?.id === 'string' ? g.id : defaultGroups[index]?.id ?? `group-${index + 1}`,
          name: typeof g?.name === 'string' ? g.name : defaultGroups[index]?.name ?? `Группа ${index + 1}`,
          roomIndexes: Array.isArray(g?.roomIndexes)
            ? g.roomIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < 4)
            : defaultGroups[index]?.roomIndexes ?? [],
        }))
        .filter((g) => g.roomIndexes.length > 0)
    : defaultGroups

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
    groups: restoredGroups.length > 0 ? restoredGroups : defaultGroups,
  }
}

function App() {
  const [appState, setAppState] = useState(DEFAULT_STATE)
  const [copyStatus, setCopyStatus] = useState('')
  const [syncStatus, setSyncStatus] = useState('Loading')
  const [hydrated, setHydrated] = useState(false)
  const [loadedFromDbKey, setLoadedFromDbKey] = useState('')
  const [canCreateRecord, setCanCreateRecord] = useState(false)

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      setSyncStatus('Loading')
      if (!hasSupabaseConfig) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw && active) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              setAppState(normalizeState(parsed))
            } else {
              setAppState(DEFAULT_STATE)
            }
          } else if (active) {
            setAppState(DEFAULT_STATE)
          }
          if (active) {
            setSyncStatus('Synced')
            setHydrated(true)
          }
        } catch {
          if (active) {
            setAppState(DEFAULT_STATE)
            setSyncStatus('Error')
            setHydrated(false)
          }
        }
        return
      }

      try {
        const loadedRow = await loadState()
        if (!active) return

        if (loadedRow?.data && typeof loadedRow.data === 'object') {
          const finalStateAfterMigration = normalizeState(loadedRow.data)
          setAppState(finalStateAfterMigration)
          setLoadedFromDbKey(loadedRow.key || '')
          console.log('loaded.data', loadedRow.data)
          console.log('finalStateAfterMigration', finalStateAfterMigration)
          setCanCreateRecord(false)
          setHydrated(true)
          setSyncStatus('Synced')
        } else {
          setAppState(DEFAULT_STATE)
          setLoadedFromDbKey('')
          setCanCreateRecord(true)
          setHydrated(false)
          setSyncStatus('Error')
        }        
      } catch {
        if (active) {
          setSyncStatus('Error')
          setHydrated(false)
        }
      }
    }

    bootstrap()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (hasSupabaseConfig) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState, hydrated])

  useEffect(() => {
    if (!hydrated) return undefined

    if (!hasSupabaseConfig) {
      setSyncStatus('Synced')
      return undefined
    }

    setSyncStatus('Loading')
    const timer = setTimeout(async () => {
      try {
        await saveState(appState)
        setSyncStatus('Synced')
      } catch {
        setSyncStatus('Error')
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [appState, hydrated])

  useEffect(() => {
    if (!copyStatus) return undefined
    const timer = setTimeout(() => setCopyStatus(''), 1800)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const metrics = useMemo(() => {
    const A_day = usage(appState.meterA.dayPrev, appState.meterA.dayCurr)
    const A_night = usage(appState.meterA.nightPrev, appState.meterA.nightCurr)
    const A_total = A_day + A_night

    const B_total = usage(appState.meterB.prev, appState.meterB.curr)
    const C_total = usage(appState.meterC.prev, appState.meterC.curr)
    const Common_kwh = Math.max(0, A_total - (B_total + C_total))

    const peopleRaw = appState.people.map((value) => parsePeople(value))
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

    if (totalPeoplePositive === 0) warnings.push('Нет жильцов')

    const dayShare = A_total === 0 ? 0.5 : A_day / A_total
    const nightShare = 1 - dayShare
    const pricePerKwh = dayShare * parseNumber(appState.tariffDay) + nightShare * parseNumber(appState.tariffNight)

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

    const families = appState.groups.map((group) => {
      const selectedRooms = group.roomIndexes.map((idx) => rooms[idx]).filter(Boolean)
      return {
        name: group.name,
        people: selectedRooms.reduce((sum, room) => sum + room.people, 0),
        totalKwh: selectedRooms.reduce((sum, room) => sum + room.totalKwh, 0),
        cost: selectedRooms.reduce((sum, room) => sum + room.cost, 0),
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
      families,
      totalPeople: peopleRaw.reduce((sum, p) => sum + p, 0),
      Rooms_total,
      Total_rub,
      warnings,
    }
  }, [appState])

  const errors = {
    aDay: isLowerThanPrev(appState.meterA.dayPrev, appState.meterA.dayCurr),
    aNight: isLowerThanPrev(appState.meterA.nightPrev, appState.meterA.nightCurr),
    b: isLowerThanPrev(appState.meterB.prev, appState.meterB.curr),
    c: isLowerThanPrev(appState.meterC.prev, appState.meterC.curr),
  }

  const setField = (path, value) => {
    setAppState((prev) => {
      const next = structuredClone(prev)
      let cursor = next
      for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]]
      cursor[path[path.length - 1]] = value
      return next
    })
  }

  const setPeople = (index, value) => {
    setAppState((prev) => {
      const next = structuredClone(prev)
      next.people[index] = parsePeople(value)
      return next
    })
  }

  const resetAll = () => {
    if (!hasSupabaseConfig) {
      localStorage.removeItem(STORAGE_KEY)
    }
    setAppState(DEFAULT_STATE)
    setCopyStatus('')
  }

  const handleCreateDbRecord = async () => {
    if (!hasSupabaseConfig) return
    setSyncStatus('Loading')
    try {
      await saveState(appState, { insertOnly: true })
      setLoadedFromDbKey(APARTMENT_KEY)
      setCanCreateRecord(false)
      setHydrated(true)
      setSyncStatus('Synced')
    } catch {
      setSyncStatus('Error')
    }
  }

  const handleCopyReport = async () => {
    const report = [
      '🧾 Power Split',
      `☀️/🌙 Тарифы: день ${formatMoney(parseNumber(appState.tariffDay))}, ночь ${formatMoney(parseNumber(appState.tariffNight))}`,
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

  return (
    <main className="app">
      <section className="card">
        <div className="cloud-bar">
          <p className="cloud-status">Status: {syncStatus}</p>
          <p className="cloud-link">Current key: <code>{APARTMENT_KEY}</code></p>
          <p className="cloud-link">
            loadedFromDbKey: <code>{loadedFromDbKey || '—'}</code>
          </p>
          {hasSupabaseConfig && canCreateRecord && (
            <button type="button" className="btn secondary" onClick={handleCreateDbRecord}>
              Создать запись в БД
            </button>
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
                  value={appState.tariffDay}
                  onChange={(e) => setField(['tariffDay'], e.target.value)}
                />
              </label>
              <label>
                Ночь (₽/кВт⋅ч)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={appState.tariffNight}
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
                  value={appState.meterA.dayPrev}
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
                  value={appState.meterA.dayCurr}
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
                  value={appState.meterA.nightPrev}
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
                  value={appState.meterA.nightCurr}
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
                  value={appState.meterB.prev}
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
                  value={appState.meterB.curr}
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
                  value={appState.meterC.prev}
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
                  value={appState.meterC.curr}
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
                  value={appState.people[index]}
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
