import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CloudUpload,
  Droplets,
  FileSpreadsheet,
  Filter,
  History,
  Layers3,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Trash2,
  Tractor,
  Trees,
  UserRoundCog,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Circle, MapContainer, Popup, TileLayer } from 'react-leaflet'
import DistrictChoropleth from './components/DistrictChoropleth'
import 'leaflet/dist/leaflet.css'
import './App.css'

const STATUS_COLORS = {
  Proposed: '#8993a4',
  Approved: '#4c7cf3',
  Started: '#ed9f35',
  Completed: '#199568',
}
const CATEGORY_ICONS = [Droplets, Layers3, Sprout, Trees]
const CSV_TEMPLATE =
  'name,description,category,subCategory,state,district,block,gramPanchayat,lat,lng,plannedProgress,actualProgress,status,expenditure,plannedStartDate,plannedEndDate,actualStartDate,actualEndDate\n'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

async function api(path, options = {}, token) {
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const body = contentType.includes('application/json') ? await response.json() : null
    const rowErrors = body?.errors?.map((item) => `Row ${item.row}: ${item.message}`).join('\n')
    throw new Error([body?.message, rowErrors].filter(Boolean).join('\n') || `Request failed (${response.status}).`)
  }
  return contentType.includes('application/json') ? response.json() : response.blob()
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify(form),
      })
      onLogin(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><Sprout size={25} /></div>
        <span className="eyebrow">RURAL DEVELOPMENT MONITOR</span>
        <h1>Welcome to <span>VB-G RAM G</span></h1>
        <p className="login-copy">One clear view of the work building stronger villages.</p>
        <div className="login-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create viewer account</button>
        </div>
        <form onSubmit={submit} className="login-form">
          {mode === 'register' && (
            <label>Full name<input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" /></label>
          )}
          <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>
          <label>Password<input required minLength={mode === 'register' ? 8 : 1} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} /></label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{mode === 'login' ? 'Sign in to dashboard' : 'Create viewer account'}</button>
        </form>
        <div className="login-foot"><ShieldCheck size={15} /> Secure access Â· role-protected data</div>
      </section>
    </main>
  )
}

function MetricCard({ icon: Icon, label, value, note, accent }) {
  return (
    <article className={`metric-card ${accent}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status?.toLowerCase()}`}>{status}</span>
}

function DemoDataToggle({ enabled, onChange }) {
  return (
    <label className="demo-toggle">
      <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
      <span>Show demo data</span>
    </label>
  )
}

function safeEvidenceUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function Dashboard({ session, onLogout }) {
  const [categories, setCategories] = useState([])
  const [works, setWorks] = useState([])
  const [users, setUsers] = useState([])
  const [summary, setSummary] = useState(null)
  const [filters, setFilters] = useState({
    category: '',
    state: '',
    district: '',
    block: '',
    gramPanchayat: '',
    status: '',
    periodFrom: '',
    periodTo: '',
  })
  const [locations, setLocations] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeTab, setActiveTab] = useState('Overview')
  const [showWorkForm, setShowWorkForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [historyWork, setHistoryWork] = useState(null)
  const [fieldUpdates, setFieldUpdates] = useState([])
  const [historyPagination, setHistoryPagination] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'officer' })
  const [editingWork, setEditingWork] = useState(null)
  const [showDelayedOnly, setShowDelayedOnly] = useState(false)
  const [showDemoData, setShowDemoData] = useState(() => {
    try {
      return localStorage.getItem('vb-gram-g-show-demo-data') !== 'false'
    } catch {
      return true
    }
  })
  const [saving, setSaving] = useState(false)
  const [expandedDistrict, setExpandedDistrict] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    subCategory: '',
    state: 'Madhya Pradesh',
    district: '',
    block: '',
    gramPanchayat: '',
    lat: '',
    lng: '',
    plannedProgress: 0,
    actualProgress: 0,
    status: 'Proposed',
    expenditure: 0,
    plannedStartDate: '',
    plannedEndDate: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
        page: String(page),
        limit: '50',
      })
      if (showDemoData) query.set('includeDemo', 'true')
      if (search.trim()) query.set('q', search.trim())
      if (showDelayedOnly) query.set('delayed', 'true')
      const summaryQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
      if (showDemoData) summaryQuery.set('includeDemo', 'true')
      const requests = [
        api(`/api/works?${query}`, {}, session.token),
        api('/api/categories', {}, session.token),
        api(`/api/dashboard/summary?${summaryQuery}`, {}, session.token),
        api('/api/works/locations', {}, session.token),
      ]
      if (session.user.role === 'admin') requests.push(api('/api/auth/users', {}, session.token))
      const [workResult, categoryResult, summaryResult, locationResult, userResult] = await Promise.all(requests)
      const lastPage = Math.max(1, workResult.pagination.pages)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      setWorks(workResult.data)
      setPagination(workResult.pagination)
      setCategories(categoryResult.data)
      setSummary(summaryResult.data)
      setLocations(locationResult.data)
      if (userResult) setUsers(userResult.data)
    } catch (requestError) {
      setError(requestError.message)
      if (/token|authentication/i.test(requestError.message)) onLogout()
    } finally {
      setLoading(false)
    }
  }, [filters, onLogout, page, search, session.token, session.user.role, showDelayedOnly, showDemoData])

  useEffect(() => {
    const request = window.setTimeout(loadData, 200)
    return () => window.clearTimeout(request)
  }, [loadData])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    try {
      localStorage.setItem('vb-gram-g-show-demo-data', String(showDemoData))
    } catch {
      setError('Demo data visibility could not be saved in this browser.')
    }
  }, [showDemoData])

  const filteredWorks = useMemo(
    () => works.filter((work) => !showDelayedOnly || work.actualProgress < work.plannedProgress),
    [works, showDelayedOnly]
  )
  const sortedWorks = useMemo(() => {
    const rows = [...filteredWorks]
    if (sortBy === 'name') rows.sort((left, right) => left.name.localeCompare(right.name))
    if (sortBy === 'progress-asc') rows.sort((left, right) => left.actualProgress - right.actualProgress)
    if (sortBy === 'progress-desc') rows.sort((left, right) => right.actualProgress - left.actualProgress)
    return rows
  }, [filteredWorks, sortBy])
  const selectedState = locations.find((state) => state.name === filters.state)
  const districtOptions = selectedState?.districts || []
  const selectedDistrict = districtOptions.find((district) => district.name === filters.district)
  const blockOptions = selectedDistrict?.blocks || []
  const selectedBlock = blockOptions.find((block) => block.name === filters.block)
  const gramPanchayatOptions = selectedBlock?.gramPanchayats || []
  const districtData = summary?.byDistrict || []

  const selectedCategory = categories.find((category) => category._id === form.category)
  const canManage = ['admin', 'officer'].includes(session.user.role)
  const currentUserId = String(session.user.id || session.user._id || '')

  function setFilter(key, value) {
    const resets = {
      state: ['district', 'block', 'gramPanchayat'],
      district: ['block', 'gramPanchayat'],
      block: ['gramPanchayat'],
    }
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...Object.fromEntries((resets[key] || []).map((field) => [field, ''])),
    }))
    setPage(1)
  }

  function isCurrentUser(user) {
    return String(user._id) === currentUserId
  }

  function selectHeatMapDistrict(district) {
    setFilters((current) => ({
      ...current,
      state: district.state,
      district: district.name,
      block: '',
      gramPanchayat: '',
    }))
    setPage(1)
    setExpandedDistrict(district.key)
  }

  function selectHeatMapState(state) {
    setFilters((current) => ({ ...current, state, district: '', block: '', gramPanchayat: '' }))
    setPage(1)
  }

  function returnToIndiaMap() {
    setFilters((current) => ({ ...current, state: '', district: '', block: '', gramPanchayat: '' }))
    setPage(1)
  }

  function openEditForm(work) {
    setEditingWork(work)
    setForm({
      name: work.name,
      description: work.description || '',
      category: work.category?._id || '',
      subCategory: work.subCategory,
      state: work.location.state,
      district: work.location.district,
      block: work.location.block,
      gramPanchayat: work.location.gramPanchayat,
      lat: work.lat,
      lng: work.lng,
      plannedProgress: work.plannedProgress,
      actualProgress: work.actualProgress,
      status: work.status,
      expenditure: work.expenditure || 0,
      plannedStartDate: work.plannedStartDate?.slice(0, 10) || '',
      plannedEndDate: work.plannedEndDate?.slice(0, 10) || '',
    })
    setShowWorkForm(true)
  }

  async function saveWork(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        ...form,
        lat: Number(form.lat),
        lng: Number(form.lng),
        plannedProgress: Number(form.plannedProgress),
        actualProgress: Number(form.actualProgress),
        expenditure: Number(form.expenditure),
        location: {
          state: form.state,
          district: form.district,
          block: form.block,
          gramPanchayat: form.gramPanchayat,
        },
      }
      delete body.state
      delete body.district
      delete body.block
      delete body.gramPanchayat
      await api(editingWork ? `/api/works/${editingWork._id}` : '/api/works', {
        method: editingWork ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }, session.token)
      setShowWorkForm(false)
      setNotice(editingWork ? 'Work record updated successfully.' : 'Work record added successfully.')
      setEditingWork(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWork(work) {
    if (!window.confirm(`Delete "${work.name}"? This action cannot be undone.`)) return
    try {
      const result = await api(`/api/works/${work._id}`, { method: 'DELETE' }, session.token)
      const deletedAt = result.audit?.recordedAt
        ? new Date(result.audit.recordedAt).toLocaleString()
        : 'timestamp unavailable'
      setNotice(`Work record deleted by ${result.audit?.actorName || 'an administrator'} at ${deletedAt}.`)
      await loadData()
    } catch (requestError) {
      await loadData()
      setError(requestError.message)
    }
  }

  async function openFieldHistory(work) {
    setHistoryWork(work)
    setFieldUpdates([])
    setHistoryPagination(null)
    setHistoryError('')
    setHistoryLoading(true)
    try {
      const result = await api(
        `/api/field-updates?workId=${encodeURIComponent(work._id)}`,
        {},
        session.token,
      )
      setFieldUpdates(result.data)
      setHistoryPagination(result.pagination)
    } catch (requestError) {
      setHistoryError(requestError.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadMoreHistory() {
    if (!historyWork || !historyPagination || historyPagination.page >= historyPagination.pages) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const nextPage = historyPagination.page + 1
      const result = await api(
        `/api/field-updates?workId=${encodeURIComponent(historyWork._id)}&page=${nextPage}&limit=${historyPagination.limit}`,
        {},
        session.token,
      )
      setFieldUpdates((current) => [...current, ...result.data])
      setHistoryPagination(result.pagination)
    } catch (requestError) {
      setHistoryError(requestError.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function createUser(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      }, session.token)
      setUserForm({ name: '', email: '', password: '', role: 'officer' })
      setShowUserForm(false)
      setNotice('Account created successfully.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateUserRole(user, role) {
    try {
      await api(`/api/auth/users/${user._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }, session.token)
      setNotice(`${user.name}'s role updated to ${role}.`)
      await loadData()
    } catch (requestError) {
      await loadData()
      setError(requestError.message)
    }
  }

  async function importCsv(event) {
    event.preventDefault()
    const file = event.currentTarget.elements.csvFile.files[0]
    if (!file) return
    const payload = new FormData()
    payload.append('file', file)
    setSaving(true)
    setError('')
    try {
      const result = await api('/api/works/import', { method: 'POST', body: payload }, session.token)
      setNotice(`${result.imported} work records imported.`)
      setShowImport(false)
      event.currentTarget.reset()
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function exportCsv() {
    setError('')
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
      if (showDemoData) query.set('includeDemo', 'true')
      if (search.trim()) query.set('q', search.trim())
      if (showDelayedOnly) query.set('delayed', 'true')
      const blob = await api(`/api/works/export.csv?${query}`, {}, session.token)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'vb-gram-g-works.csv'
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice('Filtered report downloaded.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reportZeroWorks() {
    const confirmed = window.confirm(
      `Confirm that ${filters.state} / ${filters.district} reported zero works from ${filters.periodFrom} through ${filters.periodTo}. This submission is retained as an audit record.`
    )
    if (!confirmed) return

    setSaving(true)
    setError('')
    try {
      await api('/api/reporting-coverage', {
        method: 'POST',
        body: JSON.stringify({
          state: filters.state,
          district: filters.district,
          periodFrom: filters.periodFrom,
          periodTo: filters.periodTo,
        }),
      }, session.token)
      setNotice(`Zero-work report recorded for ${filters.district}, ${filters.state}.`)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'vb-gram-g-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const summaryKpis = summary?.kpis || {}
  const statusChart = summary?.byStatus
    ? Object.entries(summary.byStatus).map(([name, value]) => ({ name, value })).filter((item) => item.value)
    : []
  const categoryChart = summary?.byCategory || []

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span className="brand-mark"><Sprout size={22} /></span><span><strong>VB-G RAM G</strong><small>Rural works monitor</small></span></a>
        <div className="nav-label">WORKSPACE</div>
        {[
          { name: 'Overview', icon: BarChart3, target: 'overview' },
          { name: 'Works registry', icon: ClipboardList, target: 'registry' },
          { name: 'GIS & geography', icon: MapPin, target: 'geography' },
          ...(session.user.role === 'admin' ? [{ name: 'User accounts', icon: UserRoundCog, target: 'user-management' }] : []),
        ].map(({ name, icon: Icon, target }) => (
          <button key={name} className={`nav-item ${activeTab === name ? 'selected' : ''}`} onClick={() => { setActiveTab(name); document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' }) }}>
            <Icon size={18} />{name}{name === 'Works registry' && <span className="nav-count">{pagination.total}</span>}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={17} /><span><strong>Phase 1 portal</strong><small>Manual work monitoring</small></span></div>
          <div className="user-mini"><div className="avatar">{session.user.name?.slice(0, 1).toUpperCase()}</div><span><strong>{session.user.name}</strong><small>{session.user.role}</small></span><button aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{activeTab}</strong></div>
          <div className="topbar-actions">{showDemoData && <span className="demo-badge">Demo data</span>}<DemoDataToggle enabled={showDemoData} onChange={setShowDemoData} /><span className="live-dot">{showDemoData ? 'Demo + live data' : 'Live data'}</span><button className="icon-button" onClick={loadData} title="Refresh"><RefreshCw size={17} /></button><div className="top-avatar">{session.user.name?.slice(0, 1).toUpperCase()}</div></div>
        </header>

        <div className="page-wrap">
          <section className="page-heading" id="overview">
            <div><span className="eyebrow">MONITORING OVERVIEW</span><h1>Good day, {session.user.name?.split(' ')[0]} <span className="wave">âœ³</span></h1><p>Hereâ€™s whatâ€™s happening across your rural development works.</p></div>
            <div className="heading-actions">
              {canManage && <button className="button secondary" onClick={() => { setError(''); setShowImport(true) }}><CloudUpload size={17} /> Import CSV</button>}
              {canManage && <button className="button primary" onClick={() => { setError(''); setEditingWork(null); setForm((current) => ({ ...current, category: categories[0]?._id || '', subCategory: categories[0]?.subcategories?.[0]?.code || '' })); setShowWorkForm(true) }}><Plus size={17} /> Add work</button>}
            </div>
          </section>

          {notice && <div className="alert success toast" role="status" aria-live="polite"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
          {error && <div className="alert error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button className="alert-retry" disabled={loading} onClick={loadData}>Retry</button><button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}

          <section className="metrics-grid">
            <MetricCard icon={ClipboardList} label="Total works" value={summaryKpis.total ?? 'â€”'} note="Across selected filters" accent="blue" />
            <MetricCard icon={CheckCircle2} label="Completed" value={summaryKpis.completed ?? 'â€”'} note="Works marked completed" accent="green" />
            <MetricCard icon={Activity} label="In progress" value={summaryKpis.inProgress ?? 'â€”'} note="Currently started" accent="orange" />
            <MetricCard icon={AlertTriangle} label="Delayed" value={summaryKpis.delayed ?? 'â€”'} note="Behind planned progress" accent="red" />
          </section>

          <section className="filter-bar" aria-label="Dashboard filters">
            <div className="filter-title"><Filter size={16} /><strong>Filters</strong></div>
            <select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
            <select value={filters.state} onChange={(event) => setFilter('state', event.target.value)} aria-label="Filter by state"><option value="">All states</option>{locations.map((state) => <option key={state.name}>{state.name}</option>)}</select>
            <select value={filters.district} onChange={(event) => setFilter('district', event.target.value)} aria-label="Filter by district" disabled={!filters.state}><option value="">All districts</option>{districtOptions.map((district) => <option key={district.name}>{district.name}</option>)}</select>
            <select value={filters.block} onChange={(event) => setFilter('block', event.target.value)} aria-label="Filter by block" disabled={!filters.district}><option value="">All blocks</option>{blockOptions.map((block) => <option key={block.name}>{block.name}</option>)}</select>
            <select value={filters.gramPanchayat} onChange={(event) => setFilter('gramPanchayat', event.target.value)} aria-label="Filter by Gram Panchayat" disabled={!filters.block}><option value="">All Gram Panchayats</option>{gramPanchayatOptions.map((name) => <option key={name}>{name}</option>)}</select>
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{Object.keys(STATUS_COLORS).map((status) => <option key={status}>{status}</option>)}</select>
            <label className="period-filter">Planned start from<input type="date" value={filters.periodFrom} onChange={(event) => setFilter('periodFrom', event.target.value)} /></label>
            <label className="period-filter">to<input type="date" value={filters.periodTo} onChange={(event) => setFilter('periodTo', event.target.value)} /></label>
            {Object.values(filters).some(Boolean) && <button className="clear-filters" onClick={() => { setFilters({ category: '', state: '', district: '', block: '', gramPanchayat: '', status: '', periodFrom: '', periodTo: '' }); setPage(1) }}>Clear all</button>}
            <button className={`delay-filter ${showDelayedOnly ? 'active' : ''}`} onClick={() => { setShowDelayedOnly((value) => !value); setPage(1) }}><AlertTriangle size={14} /> Delayed only</button>
            <span className="filter-spacer" />
            <button className="button text-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export report</button>
          </section>

          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><h2>Works by category</h2><p>Distribution of monitored works</p></div><span className="panel-icon"><BarChart3 size={17} /></span></div>
              {categoryChart.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={categoryChart} margin={{ top: 12, right: 8, left: -22, bottom: 6 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f4" /><XAxis dataKey="name" tick={{ fill: '#788397', fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={54} /><YAxis allowDecimals={false} tick={{ fill: '#8993a4', fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#527af2" radius={[5, 5, 0, 0]} maxBarSize={46} /></BarChart></ResponsiveContainer> : <EmptyChart loading={loading} />}
            </article>
            <article className="panel chart-panel status-panel">
              <div className="panel-heading"><div><h2>Status breakdown</h2><p>Current lifecycle stage</p></div><span className="panel-icon"><Activity size={17} /></span></div>
              {statusChart.length ? <div className="donut-wrap"><ResponsiveContainer width="60%" height={205}><PieChart><Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={83} paddingAngle={3} stroke="none">{statusChart.map((item) => <Cell key={item.name} fill={STATUS_COLORS[item.name]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-legend">{statusChart.map((item) => <div key={item.name}><span style={{ background: STATUS_COLORS[item.name] }} />{item.name}<strong>{item.value}</strong></div>)}</div></div> : <EmptyChart loading={loading} />}
            </article>
            <article className="panel chart-panel trend-panel">
              <div className="panel-heading"><div><h2>Progress snapshot</h2><p>Average planned vs. actual progress</p></div><span className="panel-icon"><Activity size={17} /></span></div>
              {summary?.progressTrend?.length ? <ResponsiveContainer width="100%" height={220}><LineChart data={summary.progressTrend} margin={{ top: 10, right: 18, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f4" /><XAxis dataKey="month" tick={{ fill: '#8993a4', fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fill: '#8993a4', fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="plannedProgress" name="Planned" stroke="#aab4c3" strokeDasharray="5 4" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="actualProgress" name="Actual" stroke="#527af2" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <EmptyChart loading={loading} />}
            </article>
          </section>

          <section className="geo-grid" id="geography">
            <article className="panel map-panel">
              <div className="panel-heading"><div><h2>Works map</h2><p>Page {pagination.page} of {pagination.pages || 1} Â· {pagination.total} matching works</p>{showDemoData && <span className="demo-badge section-demo-badge">Demo data included</span>}</div><div className="map-heading-actions"><DemoDataToggle enabled={showDemoData} onChange={setShowDemoData} /><span className="panel-icon"><MapPin size={17} /></span></div></div>
              <div className="map-frame">
                <MapContainer center={[23.15, 79.95]} zoom={9} scrollWheelZoom={false} className="leaflet-map">
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {filteredWorks.filter((work) => Number.isFinite(work.lat) && Number.isFinite(work.lng)).map((work) => (
                    <Circle key={work._id} center={[work.lat, work.lng]} radius={150} pathOptions={{ color: STATUS_COLORS[work.status] || '#527af2', fillColor: STATUS_COLORS[work.status] || '#527af2', fillOpacity: 0.8 }}>
                      <Popup><strong>{work.name}</strong><br />{work.status} Â· {work.actualProgress}%<br />{work.location?.gramPanchayat}, {work.location?.district}</Popup>
                    </Circle>
                  ))}
                </MapContainer>
                <div className="map-legend">{Object.entries(STATUS_COLORS).map(([status, color]) => <span key={status}><i style={{ background: color }} />{status}</span>)}</div>
              </div>
            </article>
            <article className="panel heat-panel">
              <div className="panel-heading"><div><h2>India administrative choropleth</h2><p>India â†’ State â†’ District Â· select an area to drill down</p>{showDemoData && <span className="demo-badge section-demo-badge">Demo data included</span>}</div><div className="map-heading-actions"><DemoDataToggle enabled={showDemoData} onChange={setShowDemoData} /><span className="panel-icon"><Layers3 size={17} /></span></div></div>
              <div className="map-data-notice" role="note">
                Boundaries cover all 36 states and union territories in the pinned state layer. Work records are only for areas entered or imported; seeded records are demo data, not nationwide coverage. Any reported-zero area is an explicit manual officer/admin declaration, not an official coverage feed.
              </div>
              <DistrictChoropleth
                active={activeTab === 'GIS & geography'}
                districts={districtData}
                selectedState={filters.state}
                selectedDistrict={filters.district}
                hasSummary={Boolean(summary)}
                onSelectState={selectHeatMapState}
                onSelectDistrict={(district) => selectHeatMapDistrict({
                  ...district,
                  key: `${district.state}\u0000${district.name}`,
                })}
                onBack={returnToIndiaMap}
              />
              {canManage && filters.state && filters.district && filters.periodFrom && filters.periodTo &&
                !filters.category && !filters.status && !filters.block && !filters.gramPanchayat &&
                !search.trim() && !showDelayedOnly && (
                  <div className="coverage-report-panel">
                    <div>
                      <strong>Reporting coverage</strong>
                      <p>Record an explicit zero-work report for {filters.periodFrom} to {filters.periodTo}. Existing planned-start work records for this district and period prevent submission.</p>
                    </div>
                    <button className="button secondary" onClick={reportZeroWorks} disabled={saving}>
                      {saving ? 'Submittingâ€¦' : 'Report zero works'}
                    </button>
                  </div>
                )}
              <div className="district-list">
                {districtData.length ? districtData.map((district) => (
                  <div key={district.key}>
                    <button className={`district-row ${filters.state === district.state && filters.district === district.name ? 'active' : ''}`} onClick={() => { const selected = filters.state === district.state && filters.district === district.name; setFilters((current) => ({ ...current, state: selected ? '' : district.state, district: selected ? '' : district.name, block: '', gramPanchayat: '' })); setPage(1); setExpandedDistrict(expandedDistrict === district.key ? '' : district.key) }}>
                      <span className="district-swatch" style={{ background: district.progress === null ? '#eef0f2' : `rgba(46, 143, 102, ${0.15 + district.progress / 125})` }}><MapPin size={15} /></span>
                      <span className="district-name"><strong>{district.name}</strong><small>{district.count} works</small></span>
                      <span className="district-progress">{district.progress === null ? 'â€”' : `${district.progress}%`}</span>
                      {expandedDistrict === district.key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {expandedDistrict === district.key && <div className="drilldown">{district.blocks.map((block) => <div className="block-line" key={block.name}><strong>{block.name} Â· {block.progress === null ? 'â€”' : `${block.progress}%`}</strong>{block.gps.map((gp) => <span key={gp.name}>{gp.name}<b>{gp.progress === null ? 'â€”' : `${gp.progress}%`} ({gp.count})</b></span>)}</div>)}</div>}
                  </div>
                )) : <p className="empty-small">No location data to display.</p>}
              </div>
              <div className="heat-note"><MapPin size={14} /> Click a district to filter works and view block / GP progress.</div>
            </article>
          </section>

          <section className="panel delayed-panel">
            <div className="registry-heading">
              <div className="panel-heading"><div><h2>Delayed works for review</h2><p>Actual progress is behind the planned progress</p>{showDemoData && <span className="demo-badge section-demo-badge">Demo data included</span>}</div></div>
              <span className="delayed-count">{summary?.delayedTotal || 0} flagged</span>
            </div>
            {summary?.delayedWorks?.length ? <div className="delayed-list">{summary.delayedWorks.slice(0, 6).map((work) => <div className="delayed-row" key={work.id}><span className="delayed-warning"><AlertTriangle size={15} /></span><div className="delayed-name"><strong>{work.name}</strong><small>{work.location?.gramPanchayat}, {work.location?.district} Â· {work.category?.name}</small></div><span className="delayed-progress">{work.actualProgress}% <small>actual</small></span><span className="delayed-progress planned">{work.plannedProgress}% <small>planned</small></span><StatusBadge status={work.status} /></div>)}</div> : <div className="empty-table">No delayed works in this view.</div>}
          </section>

          <section className="panel registry-panel" id="registry">
            <div className="registry-heading">
              <div><div className="panel-heading"><div><h2>Works registry</h2><p>Review and manage individual work records</p>{showDemoData && <span className="demo-badge section-demo-badge">Demo data included</span>}</div></div></div>
              <div className="registry-tools"><label className="search-box"><Search size={16} /><input aria-label="Search works" maxLength={100} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search works..." /></label><label className="sort-control">Sort <select aria-label="Sort works" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Newest</option><option value="name">Name Aâ€“Z</option><option value="progress-asc">Progress lowâ€“high</option><option value="progress-desc">Progress highâ€“low</option></select></label><span>{pagination.total} records</span></div>
            </div>
            <div className="table-scroll">
              <table><thead><tr><th>WORK NAME</th><th>CATEGORY</th><th>LOCATION</th><th>PROGRESS</th><th>STATUS</th><th>REVIEW</th><th>HISTORY</th>{canManage && <th>ACTIONS</th>}</tr></thead>
                <tbody>{sortedWorks.map((work, index) => {
                  const Icon = CATEGORY_ICONS[categories.findIndex((category) => category._id === work.category?._id)] || Tractor
                  const delayed = work.actualProgress < work.plannedProgress
                  return <tr key={work._id}><td><div className="work-title-cell"><span className={`work-icon icon-${index % 4}`}><Icon size={17} /></span><span><strong>{work.name}</strong><small>Updated {work.updatedAt ? new Date(work.updatedAt).toLocaleDateString() : 'â€”'}</small></span></div></td><td>{work.category?.name || 'â€”'}<small className="subcat">{work.subCategory}</small></td><td>{work.location?.gramPanchayat}<small className="subcat">{work.location?.district}</small></td><td><div className="progress-cell"><div className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, work.actualProgress))}%` }} /></div><span>{work.actualProgress}%</span></div><small className="subcat">of {work.plannedProgress}% planned</small></td><td><StatusBadge status={work.status} /></td><td>{delayed ? <span className="review-pill"><AlertTriangle size={13} />Delayed</span> : <span className="on-track">On track</span>}</td><td><button className="history-button" onClick={() => openFieldHistory(work)}><History size={14} /> View</button></td>{canManage && <td><div className="row-actions"><button aria-label={`Edit ${work.name}`} title="Edit work" onClick={() => openEditForm(work)}><Pencil size={14} /></button>{session.user.role === 'admin' && <button aria-label={`Delete ${work.name}`} title="Delete work" onClick={() => deleteWork(work)}><Trash2 size={14} /></button>}</div></td>}</tr>
                })}</tbody>
              </table>
              {!filteredWorks.length && <div className="empty-table">{loading ? 'Loading works...' : 'No works match these filters.'}</div>}
            </div>
            <div className="pagination-controls">
              <span>Showing {pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0}â€“{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
              <div><button className="button secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {pagination.page} of {pagination.pages || 1}</span><button className="button secondary" disabled={loading || page >= pagination.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
            </div>
          </section>

          {session.user.role === 'admin' && <section className="panel registry-panel user-management-panel" id="user-management">
            <div className="registry-heading">
              <div className="panel-heading"><div><h2>User accounts</h2><p>Manage administrator, officer, and viewer access</p></div></div>
              <button className="button primary" onClick={() => { setError(''); setShowUserForm(true) }}><Plus size={16} /> Add account</button>
            </div>
            <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>JOINED</th></tr></thead><tbody>
              {users.map((user) => <tr key={user._id}><td><div className="work-title-cell"><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span><strong>{user.name}{isCurrentUser(user) && <small className="subcat">You</small>}</strong></div></td><td>{user.email}</td><td><select aria-label={`Role for ${user.name}`} className="role-select" value={user.role} disabled={isCurrentUser(user)} onChange={(event) => updateUserRole(user, event.target.value)}>{['admin', 'officer', 'viewer'].map((role) => <option key={role} value={role}>{role}</option>)}</select></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'â€”'}</td></tr>)}
            </tbody></table>{!users.length && <div className="empty-table">{loading ? 'Loading accounts...' : 'No accounts found.'}</div>}</div>
          </section>}

          <footer className="page-footer"><span>VB-G RAM G Â· Rural development monitoring</span><span>Phase 1 Â· Manual reporting</span></footer>
        </div>
      </main>

      {showWorkForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowWorkForm(false); setEditingWork(null) } }}><section className="modal-card"><div className="modal-head"><div><span className="eyebrow">WORK REGISTRY</span><h2>{editingWork ? 'Edit work record' : 'Add a work record'}</h2></div><button className="icon-button" onClick={() => { setShowWorkForm(false); setEditingWork(null) }} aria-label="Close"><X size={19} /></button></div>
        {error && <div className="alert error modal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
        <form className="work-form" onSubmit={saveWork}><label className="wide">Work name<input required maxLength="200" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="wide">Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Category<select required value={form.category} onChange={(event) => { const category = categories.find((item) => item._id === event.target.value); setForm({ ...form, category: event.target.value, subCategory: category?.subcategories?.[0]?.code || '' }) }}><option value="">Choose category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
          <label>Sub-category<select required value={form.subCategory} onChange={(event) => setForm({ ...form, subCategory: event.target.value })}><option value="">Choose sub-category</option>{selectedCategory?.subcategories?.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          {['state', 'district', 'block', 'gramPanchayat'].map((field) => <label key={field}>{field === 'gramPanchayat' ? 'Gram Panchayat' : field[0].toUpperCase() + field.slice(1)}<input required value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
          {[
            ['lat', 'Latitude', 'number', -90, 90, '0.0001'],
            ['lng', 'Longitude', 'number', -180, 180, '0.0001'],
            ['plannedProgress', 'Planned progress %', 'number', 0, 100, '1'],
            ['actualProgress', 'Actual progress %', 'number', 0, 100, '1'],
            ['expenditure', 'Expenditure', 'number', 0, undefined, '1'],
          ].map(([field, label, type, min, max, step]) => <label key={field}>{label}<input required={field !== 'expenditure'} type={type} min={min} max={max} step={step} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
          <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{Object.keys(STATUS_COLORS).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Planned start<input type="date" required value={form.plannedStartDate} onChange={(event) => setForm({ ...form, plannedStartDate: event.target.value })} /></label>
          <label>Planned end<input type="date" required value={form.plannedEndDate} onChange={(event) => setForm({ ...form, plannedEndDate: event.target.value })} /></label>
          <div className="modal-actions wide"><button type="button" className="button secondary" onClick={() => { setShowWorkForm(false); setEditingWork(null) }}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Savingâ€¦' : editingWork ? 'Save changes' : 'Save work'}</button></div>
        </form></section></div>}

      {showImport && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImport(false) }}><section className="modal-card import-modal"><div className="modal-head"><div><span className="eyebrow">BULK IMPORT</span><h2>Import works from CSV</h2></div><button className="icon-button" onClick={() => setShowImport(false)} aria-label="Close"><X size={19} /></button></div>
        <div className="import-info"><FileSpreadsheet size={20} /><div><strong>Prepare your CSV file</strong><p>Use category names and sub-category codes from the seeded list. Import is all-or-nothing: invalid rows are reported and nothing is saved.</p></div></div>
        <button className="template-link" onClick={downloadTemplate}><ArrowDownToLine size={15} /> Download CSV header template</button>
        {error && <div className="alert error modal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
        <form onSubmit={importCsv}><label className="file-drop"><CloudUpload size={24} /><strong>Choose a .csv file</strong><span>Maximum file size 2 MB Â· up to 1,000 records</span><input name="csvFile" required type="file" accept=".csv,text/csv" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowImport(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Validatingâ€¦' : 'Validate & import'}</button></div></form>
      </section></div>}

      {showUserForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowUserForm(false) }}><section className="modal-card user-modal"><div className="modal-head"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Create an account</h2></div><button className="icon-button" onClick={() => setShowUserForm(false)} aria-label="Close"><X size={19} /></button></div>
        <p className="user-modal-note">New accounts must use a strong password. Public sign-up remains viewer-only.</p>
        {error && <div className="alert error modal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
        <form className="user-form" onSubmit={createUser}>
          <label>Full name<input required maxLength="100" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} /></label>
          <label>Email address<input required type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label>
          <label>Temporary password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /><small>At least 12 characters</small></label>
          <label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="officer">Officer</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowUserForm(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Creatingâ€¦' : 'Create account'}</button></div>
        </form>
      </section></div>}

      {historyWork && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryWork(null) }}><section className="modal-card history-modal"><div className="modal-head"><div><span className="eyebrow">DEVICE & FIELD ACTIVITY</span><h2>{historyWork.name}</h2><p>{historyWork.location?.gramPanchayat}, {historyWork.location?.district}</p></div><button className="icon-button" onClick={() => setHistoryWork(null)} aria-label="Close history"><X size={19} /></button></div>
        <div className="history-current"><span>Current progress</span><strong>{historyWork.actualProgress}%</strong><StatusBadge status={historyWork.status} /></div>
        <div className="record-audit" aria-label="Work record audit">
          <div><span>Created</span><strong>{historyWork.createdBy?.name || 'Legacy record / unavailable'}</strong><small>{historyWork.createdAt ? new Date(historyWork.createdAt).toLocaleString() : 'Timestamp unavailable'}</small></div>
          <div><span>Last updated</span><strong>{historyWork.updatedBy?.name || (historyWork.source === 'iot' ? 'IoT device' : 'Legacy record / unavailable')}</strong><small>{historyWork.updatedAt ? new Date(historyWork.updatedAt).toLocaleString() : 'Timestamp unavailable'}</small></div>
        </div>
        {historyError && <div className="alert error modal-error" role="alert"><AlertTriangle size={16} /><span>{historyError}</span><button className="alert-retry" onClick={() => openFieldHistory(historyWork)}>Retry</button></div>}
        {historyLoading && !fieldUpdates.length ? <div className="empty-chart"><LoaderCircle size={20} className="spin" />Loading field updatesâ€¦</div> : fieldUpdates.length ? <><div className="history-list">{fieldUpdates.map((update) => <article className="history-entry" key={update._id}><span className="history-dot" /><div className="history-entry-body"><div className="history-entry-head"><strong>{update.progress}% reported</strong><StatusBadge status={update.status} /></div><p>{update.receivedAt ? new Date(update.receivedAt).toLocaleString() : 'Timestamp unavailable'} Â· {Number.isFinite(update.lat) && Number.isFinite(update.lng) ? `${update.lat.toFixed(5)}, ${update.lng.toFixed(5)}` : 'Coordinates unavailable'}</p>{safeEvidenceUrl(update.evidenceUrl) && <a href={safeEvidenceUrl(update.evidenceUrl)} target="_blank" rel="noreferrer">View evidence <ChevronRight size={13} /></a>}</div></article>)}</div>{historyPagination?.page < historyPagination?.pages && <button className="button secondary history-more" disabled={historyLoading} onClick={loadMoreHistory}>{historyLoading ? 'Loadingâ€¦' : 'Load more updates'}</button>}</> : !historyError ? <div className="empty-chart"><History size={22} /><span>No field or device updates have been submitted for this work yet.</span></div> : null}
      </section></div>}
    </div>
  )
}

function EmptyChart({ loading }) {
  return <div className="empty-chart">{loading ? <LoaderCircle size={20} className="spin" /> : <><BarChart3 size={24} /><span>No chart data for this filter</span></>}</div>
}

export default function PortalApp() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vb-gram-g-session') || 'null')
    } catch {
      return null
    }
  })

  function handleLogin(result) {
    const next = { token: result.token, user: result.user }
    localStorage.setItem('vb-gram-g-session', JSON.stringify(next))
    setSession(next)
  }

  const handleLogout = useCallback(() => {
    localStorage.removeItem('vb-gram-g-session')
    setSession(null)
  }, [])

  return session?.token ? <Dashboard session={session} onLogout={handleLogout} /> : <LoginScreen onLogin={handleLogin} />
}
