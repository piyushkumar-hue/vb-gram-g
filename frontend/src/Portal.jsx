                <tbody>{sortedWorks.map((work, index) => {
                  const Icon = CATEGORY_ICONS[categories.findIndex((category) => category._id === work.category?._id)] || Tractor
                  const delayed = work.actualProgress < work.plannedProgress
                  return <tr key={work._id}><td><div className="work-title-cell"><span className={`work-icon icon-${index % 4}`}><Icon size={17} /></span><span><strong>{work.name}</strong><small>Updated {work.updatedAt ? new Date(work.updatedAt).toLocaleDateString() : '—'}</small></span></div></td><td>{work.category?.name || '—'}<small className="subcat">{work.subCategory}</small></td><td>{work.location?.gramPanchayat}<small className="subcat">{work.location?.district}</small></td><td><div className="progress-cell"><div className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, work.actualProgress))}%` }} /></div><span>{work.actualProgress}%</span></div><small className="subcat">of {work.plannedProgress}% planned</small></td><td><StatusBadge status={work.status} /></td><td>{delayed ? <span className="review-pill"><AlertTriangle size={13} />Delayed</span> : <span className="on-track">On track</span>}</td><td><button className="history-button" onClick={() => openFieldHistory(work)}><History size={14} /> View</button></td>{canManage && <td><div className="row-actions"><button aria-label={`Edit ${work.name}`} title="Edit work" onClick={() => openEditForm(work)}><Pencil size={14} /></button>{session.user.role === 'admin' && <button aria-label={`Delete ${work.name}`} title="Delete work" onClick={() => deleteWork(work)}><Trash2 size={14} /></button>}</div></td>}</tr>
                })}</tbody>
              </table>
              {!filteredWorks.length && <div className="empty-table">{loading ? 'Loading works...' : 'No works match these filters.'}</div>}
            </div>
            <div className="pagination-controls">
              <span>Showing {pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
              <div><button className="button secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {pagination.page} of {pagination.pages || 1}</span><button className="button secondary" disabled={loading || page >= pagination.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
            </div>
          </section>

          {session.user.role === 'admin' && <section className="panel registry-panel user-management-panel" id="user-management">
            <div className="registry-heading">
              <div className="panel-heading"><div><h2>User accounts</h2><p>Manage administrator, officer, and viewer access</p></div></div>
              <button className="button primary" onClick={() => { setError(''); setShowUserForm(true) }}><Plus size={16} /> Add account</button>
            </div>
            <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>JOINED</th></tr></thead><tbody>
              {users.map((user) => <tr key={user._id}><td><div className="work-title-cell"><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span><strong>{user.name}{isCurrentUser(user) && <small className="subcat">You</small>}</strong></div></td><td>{user.email}</td><td><select aria-label={`Role for ${user.name}`} className="role-select" value={user.role} disabled={isCurrentUser(user)} onChange={(event) => updateUserRole(user, event.target.value)}>{['admin', 'officer', 'viewer'].map((role) => <option key={role} value={role}>{role}</option>)}</select></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td></tr>)}
            </tbody></table>{!users.length && <div className="empty-table">{loading ? 'Loading accounts...' : 'No accounts found.'}</div>}</div>
          </section>}

          <footer className="page-footer"><span>VB-G RAM G · Rural development monitoring</span><span>Phase 1 · Manual reporting</span></footer>
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
          <div className="modal-actions wide"><button type="button" className="button secondary" onClick={() => { setShowWorkForm(false); setEditingWork(null) }}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : editingWork ? 'Save changes' : 'Save work'}</button></div>
        </form></section></div>}

      {showImport && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImport(false) }}><section className="modal-card import-modal"><div className="modal-head"><div><span className="eyebrow">BULK IMPORT</span><h2>Import works from CSV</h2></div><button className="icon-button" onClick={() => setShowImport(false)} aria-label="Close"><X size={19} /></button></div>
        <div className="import-info"><FileSpreadsheet size={20} /><div><strong>Prepare your CSV file</strong><p>Use category names and sub-category codes from the seeded list. Import is all-or-nothing: invalid rows are reported and nothing is saved.</p></div></div>
        <button className="template-link" onClick={downloadTemplate}><ArrowDownToLine size={15} /> Download CSV header template</button>
        {error && <div className="alert error modal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
        <form onSubmit={importCsv}><label className="file-drop"><CloudUpload size={24} /><strong>Choose a .csv file</strong><span>Maximum file size 2 MB · up to 1,000 records</span><input name="csvFile" required type="file" accept=".csv,text/csv" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowImport(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Validating…' : 'Validate & import'}</button></div></form>
      </section></div>}

      {showUserForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowUserForm(false) }}><section className="modal-card user-modal"><div className="modal-head"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Create an account</h2></div><button className="icon-button" onClick={() => setShowUserForm(false)} aria-label="Close"><X size={19} /></button></div>
        <p className="user-modal-note">New accounts must use a strong password. Public sign-up remains viewer-only.</p>
        {error && <div className="alert error modal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
        <form className="user-form" onSubmit={createUser}>
          <label>Full name<input required maxLength="100" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} /></label>
          <label>Email address<input required type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label>
          <label>Temporary password<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /><small>At least 12 characters</small></label>
          <label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="officer">Officer</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowUserForm(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button></div>
        </form>
      </section></div>}

      {historyWork && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryWork(null) }}><section className="modal-card history-modal"><div className="modal-head"><div><span className="eyebrow">DEVICE & FIELD ACTIVITY</span><h2>{historyWork.name}</h2><p>{historyWork.location?.gramPanchayat}, {historyWork.location?.district}</p></div><button className="icon-button" onClick={() => setHistoryWork(null)} aria-label="Close history"><X size={19} /></button></div>
        <div className="history-current"><span>Current progress</span><strong>{historyWork.actualProgress}%</strong><StatusBadge status={historyWork.status} /></div>
        <div className="record-audit" aria-label="Work record audit">
          <div><span>Created</span><strong>{historyWork.createdBy?.name || 'Legacy record / unavailable'}</strong><small>{historyWork.createdAt ? new Date(historyWork.createdAt).toLocaleString() : 'Timestamp unavailable'}</small></div>
          <div><span>Last updated</span><strong>{historyWork.updatedBy?.name || (historyWork.source === 'iot' ? 'IoT device' : 'Legacy record / unavailable')}</strong><small>{historyWork.updatedAt ? new Date(historyWork.updatedAt).toLocaleString() : 'Timestamp unavailable'}</small></div>
        </div>
        {historyError && <div className="alert error modal-error" role="alert"><AlertTriangle size={16} /><span>{historyError}</span><button className="alert-retry" onClick={() => openFieldHistory(historyWork)}>Retry</button></div>}
        {historyLoading && !fieldUpdates.length ? <div className="empty-chart"><LoaderCircle size={20} className="spin" />Loading field updates…</div> : fieldUpdates.length ? <><div className="history-list">{fieldUpdates.map((update) => <article className="history-entry" key={update._id}><span className="history-dot" /><div className="history-entry-body"><div className="history-entry-head"><strong>{update.progress}% reported</strong><StatusBadge status={update.status} /></div><p>{update.receivedAt ? new Date(update.receivedAt).toLocaleString() : 'Timestamp unavailable'} · {Number.isFinite(update.lat) && Number.isFinite(update.lng) ? `${update.lat.toFixed(5)}, ${update.lng.toFixed(5)}` : 'Coordinates unavailable'}</p>{safeEvidenceUrl(update.evidenceUrl) && <a href={safeEvidenceUrl(update.evidenceUrl)} target="_blank" rel="noreferrer">View evidence <ChevronRight size={13} /></a>}</div></article>)}</div>{historyPagination?.page < historyPagination?.pages && <button className="button secondary history-more" disabled={historyLoading} onClick={loadMoreHistory}>{historyLoading ? 'Loading…' : 'Load more updates'}</button>}</> : !historyError ? <div className="empty-chart"><History size={22} /><span>No field or device updates have been submitted for this work yet.</span></div> : null}
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
