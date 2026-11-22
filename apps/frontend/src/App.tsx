import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Patient = {
  id: string
  mrn: string
  first_name: string
  last_name: string
  date_of_birth: string
  gender?: string
  created_at: string
}

type Appointment = {
  id: string
  patient_id: string
  appointment_type: string
  reason: string
  status: string
  scheduled_start: string
  scheduled_end: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function App() {
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch('/api/patients', { headers }).then((response) => {
        if (!response.ok) throw new Error('Could not load patients')
        return response.json()
      }),
      fetch('/api/appointments', { headers }).then((response) => {
        if (!response.ok) throw new Error('Could not load appointments')
        return response.json()
      }),
    ])
      .then(([patientData, appointmentData]) => {
        setPatients(patientData.patients ?? [])
        setAppointments(appointmentData.appointments ?? [])
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mfaRequired ? { totp } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Login failed')

      if (data.mfa_required) {
        setMfaRequired(true)
        setAuthError('')
        return
      }

      if (!data.access_token) throw new Error('Login response did not include an access token')

      setToken(data.access_token)
      setPassword('')
      setTotp('')
      setMfaRequired(false)
      setLoading(true)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout() {
    setToken('')
    setPatients([])
    setAppointments([])
    setError('')
    setLoading(false)
  }

  const patientName = (id: string) => {
    const patient = patients.find((item) => item.id === id)
    return patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown patient'
  }

  const initials = (name: string) =>
    name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  if (!token) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-brand">
            <span className="brand-icon">✚</span>
            <strong>MediCore</strong>
          </div>
          <p className="eyebrow">SECURE HEALTHCARE WORKSPACE</p>
          <h1>Welcome back</h1>
          <p className="subheading">
            {mfaRequired ? 'Enter the six-digit code from your authenticator app.' : 'Sign in with your MediCore staff account.'}
          </p>
          {authError && <p role="alert" className="warning">{authError}</p>}
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" type="email" value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username" required readOnly={mfaRequired} />
          {!mfaRequired && <>
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password" required />
          </>}
          {mfaRequired && <>
            <label htmlFor="login-totp">Authenticator code</label>
            <input id="login-totp" type="text" inputMode="numeric"
              pattern="[0-9]{6}" maxLength={6} value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code" required />
          </>}
          <button className="login-button" type="submit"
            disabled={authLoading || (mfaRequired && totp.length !== 6)}>
            {authLoading ? 'Signing in…' : mfaRequired ? 'Verify code' : 'Sign in'}
          </button>
          {mfaRequired && <button type="button"
            onClick={() => { setMfaRequired(false); setTotp(''); setAuthError('') }}>
            Back to password
          </button>}
          <p className="login-note">Authorized staff accounts only.</p>
        </form>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon">✚</div><span>MediCore</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#overview"><span>▦</span> Overview</a>
          <a className="nav-item" href="#patients"><span>♙</span> Patients</a>
          <a className="nav-item" href="#appointments"><span>▣</span> Appointments</a>
          <a className="nav-item" href="#departments"><span>⌂</span> Clinical data</a>
        </nav>
        <div className="workspace-label tools-label">MANAGEMENT</div>
        <nav>
          <a className="nav-item" href="#reports"><span>▥</span> Reports</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">?</div>
            <strong>Need assistance?</strong>
            <p>Contact your system administrator.</p>
          </div>
          <div className="profile">
            <div className="avatar admin">AD</div>
            <div><strong>Admin User</strong><small>Demo dashboard</small></div>
            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
          <div className="top-actions">
            <span className="system-status"><i /> API connected</span><button className="logout-button" onClick={handleLogout}>Sign out</button>
            <div className="avatar admin">AD</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">MEDICORE HEALTHCARE PLATFORM</p>
            <h1>Healthcare overview</h1>
            <p className="subheading">Live patient and appointment data from the MediCore API.</p>
          </div>
        </section>

        {error && <p role="alert" className="warning">{error}. Check that the API is running.</p>}
        {loading && <p className="subheading">Loading live healthcare data…</p>}

        <section className="stats-grid" aria-label="Healthcare statistics">
          <article className="stat-card">
            <div className="stat-top"><span>Total patients</span><span className="stat-icon blue">♙</span></div>
            <strong>{patients.length}</strong>
            <p><span>Registered patient records</span></p>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Total appointments</span><span className="stat-icon purple">▣</span></div>
            <strong>{appointments.length}</strong>
            <p><span>Recorded appointments</span></p>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Confirmed</span><span className="stat-icon green">✓</span></div>
            <strong>{appointments.filter((item) => item.status === 'confirmed').length}</strong>
            <p><span>Confirmed appointments</span></p>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Awaiting action</span><span className="stat-icon orange">◷</span></div>
            <strong>{appointments.filter((item) => ['requested', 'scheduled'].includes(item.status)).length}</strong>
            <p><span>Requested or scheduled</span></p>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel appointments-panel" id="appointments">
            <div className="panel-heading">
              <div><h2>Appointments</h2><p>Live appointments from the database</p></div>
            </div>
            <div className="appointment-list">
              {appointments.length === 0 && !loading && <p>No appointments found.</p>}
              {appointments.map((appointment) => (
                <div className="appointment-row" key={appointment.id}>
                  <div className="time">{formatTime(appointment.scheduled_start)}</div>
                  <div className="appointment-avatar blue-bg">{initials(patientName(appointment.patient_id))}</div>
                  <div className="appointment-info">
                    <strong>{patientName(appointment.patient_id)}</strong>
                    <small>{appointment.appointment_type} · {appointment.reason}</small>
                  </div>
                  <span className={`appointment-status ${appointment.status === 'confirmed' ? 'confirmed' : 'pending'}`}>
                    {appointment.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel departments-panel" id="departments">
            <div className="panel-heading">
              <div><h2>Appointment workflow</h2><p>Current status distribution</p></div>
            </div>
            {['requested', 'scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled'].map((status) => {
              const count = appointments.filter((item) => item.status === status).length
              const percent = appointments.length ? `${count / appointments.length * 100}%` : '0%'
              return (
                <div className="department" key={status}>
                  <div><span>{status.replace('_', ' ')}</span><strong>{count}</strong></div>
                  <div className="progress"><i className="bar-blue" style={{ width: percent }} /></div>
                </div>
              )
            })}
          </article>
        </section>

        <section className="panel patients-panel" id="patients">
          <div className="panel-heading">
            <div><h2>Registered patients</h2><p>Patient records retrieved from PostgreSQL</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Patient</th><th>Medical record number</th><th>Date of birth</th><th>Gender</th><th>Registered</th></tr></thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td><div className="patient-cell"><div className="avatar patient-avatar">{initials(`${patient.first_name} ${patient.last_name}`)}</div><strong>{patient.first_name} {patient.last_name}</strong></div></td>
                    <td className="muted">{patient.mrn}</td>
                    <td>{formatDate(patient.date_of_birth)}</td>
                    <td>{patient.gender || '—'}</td>
                    <td className="muted">{formatDate(patient.created_at)}</td>
                  </tr>
                ))}
                {!loading && patients.length === 0 && <tr><td colSpan={5}>No patient records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <footer>© 2026 MediCore Healthcare Platform <span>Demonstration environment — synthetic data only</span></footer>
      </main>
    </div>
  )
}

export default App
