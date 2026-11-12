import { useEffect, useState } from 'react'

const inputStyle = { width: '100%', padding: 9, margin: '5px 0 12px', border: '1px solid #d6dfe8', borderRadius: 7 }
export default function EnhancedMonitoring({ session, api, works }) {
  const [workId,setWorkId] = useState('')
  const [record,setRecord] = useState(null)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  const [photo,setPhoto] = useState(null)
  const [gps,setGps] = useState({latitude:'',longitude:''})
  const manager = ['admin','officer'].includes(session.user.role)
  const fetchRecord = async () => {
    if (!workId) { setRecord(null); return }
    try { setRecord(await api(`/api/enhancements/works/${workId}`,{},session.token));setError('') } catch(e) { setError(e.message) }
  }
  useEffect(() => { if(workId) { api(`/api/enhancements/works/${workId}`,{},session.token).then(setRecord).catch(e=>setError(e.message)) } else setRecord(null) },[workId,api,session.token])
  async function send(e,path,body,formData=false) {
    e.preventDefault();setBusy(true);setError('');setMessage('')
    try {
      const options = formData ? {method:'POST',body} : {method:'POST',body:JSON.stringify(body)}
      if (formData) {
        const base = import.meta.env.VITE_API_BASE_URL || ''
        const response = await fetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`},body})
        const result=await response.json();if(!response.ok)throw new Error(result.message||'Upload failed')
      } else await api(path,options,session.token)
      setMessage('Saved successfully.');await fetchRecord();e.target.reset()
    } catch(err) {setError(err.message)} finally {setBusy(false)}
  }
  async function updateMilestone(id,status) {
    try {await api(`/api/enhancements/milestones/${id}`,{method:'PATCH',body:JSON.stringify({status})},session.token);await fetchRecord()}catch(e){setError(e.message)}
  }
  return <div style={{display:'grid',gap:18}}>
    <article className="panel operations-panel"><h2>Field monitoring · Financial accountability · Milestones</h2>
      <p>Select a work to inspect its verified progress, expenditure ledger, field photos, and risk indicators.</p>
      <label>Development work<select style={inputStyle} value={workId} onChange={e=>setWorkId(e.target.value)}><option value="">Select a work</option>{works.map(w=><option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
      {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p role="status" style={{color:'#047857'}}>{message}</p>}
    </article>
    {record&&<>
      <article className="panel operations-panel"><h2>Verified progress & risk</h2><p>Reported: {record.work.actualProgress}% · Latest verified: {record.verifiedProgress??'Not verified'}%</p><p>Rule-based risk score: {record.risk.score}/100</p><ul>{record.risk.reasons.map(x=><li key={x}>{x}</li>)}</ul><small>{record.risk.method}</small></article>
      <article className="panel operations-panel"><h2>Financial ledger</h2><p>Budget: ₹{Number(record.financials.budget||0).toLocaleString('en-IN')} · Ledger spent: ₹{record.financials.ledgerSpent.toLocaleString('en-IN')} · Utilization: {record.financials.utilizationPercent??'N/A'}%</p>
      {manager&&<form onSubmit={e=>{const f=new FormData(e.target);send(e,`/api/enhancements/works/${workId}/expenses`,{amount:Number(f.get('amount')),date:f.get('date'),purpose:f.get('purpose'),reference:f.get('reference')})}}><h3>Add expenditure</h3><label>Amount (₹)<input style={inputStyle} type="number" min="0.01" step="0.01" name="amount" required/></label><label>Date<input style={inputStyle} type="date" name="date" required/></label><label>Purpose<input style={inputStyle} name="purpose" maxLength="300" required/></label><label>Reference<input style={inputStyle} name="reference" maxLength="100"/></label><button className="button primary" disabled={busy}>Record expenditure</button></form>}
      {record.expenses.map(x=><p key={x._id}>₹{x.amount.toLocaleString('en-IN')} · {x.purpose} · {new Date(x.date).toLocaleDateString()}</p>)}</article>
      <article className="panel operations-panel"><h2>Milestones</h2>
      {manager&&<form onSubmit={e=>{const f=new FormData(e.target);send(e,`/api/enhancements/works/${workId}/milestones`,{title:f.get('title'),dueDate:f.get('dueDate'),notes:f.get('notes')})}}><label>Title<input style={inputStyle} name="title" required maxLength="160"/></label><label>Due date<input style={inputStyle} name="dueDate" type="date" required/></label><label>Notes<input style={inputStyle} name="notes" maxLength="1000"/></label><button className="button primary" disabled={busy}>Add milestone</button></form>}
      {record.milestones.map(m=><div className="operation-row" key={m._id}><div><strong>{m.title}</strong><p>Due {new Date(m.dueDate).toLocaleDateString()}</p></div>{manager?<select value={m.status} onChange={e=>updateMilestone(m._id,e.target.value)}>{['Pending','In progress','Completed'].map(s=><option key={s}>{s}</option>)}</select>:<span>{m.status}</span>}</div>)}</article>
      <article className="panel operations-panel"><h2>Field inspections</h2>
      {manager&&<form onSubmit={e=>{const f=new FormData(e.target);send(e,`/api/enhancements/works/${workId}/inspections`,{verdict:f.get('verdict'),reportedProgress:Number(f.get('reportedProgress')),notes:f.get('notes'),checklist:[{label:'Site inspected',passed:f.get('siteInspected')==='on'},{label:'Safety checks passed',passed:f.get('safety')==='on'}]})}}><label>Verdict<select style={inputStyle} name="verdict">{['Verified','Rejected','Needs rework'].map(s=><option key={s}>{s}</option>)}</select></label><label>Verified progress %<input style={inputStyle} type="number" min="0" max="100" name="reportedProgress" required/></label><label>Inspection notes<textarea style={inputStyle} name="notes" required maxLength="2000"/></label><label><input type="checkbox" name="siteInspected"/> Site inspected</label><label style={{marginLeft:15}}><input type="checkbox" name="safety"/> Safety checks passed</label><p><button className="button primary" disabled={busy}>Submit inspection</button></p></form>}
      {record.inspections.map(i=><p key={i._id}><strong>{i.verdict}</strong> · {i.reportedProgress}% · {i.notes} · {new Date(i.createdAt).toLocaleDateString()}</p>)}</article>
      <article className="panel operations-panel"><h2>Geo-tagged image evidence</h2>
      {manager&&<form onSubmit={e=>{const form=new FormData(e.target);form.set('latitude',gps.latitude);form.set('longitude',gps.longitude);send(e,`/api/enhancements/works/${workId}/evidence`,form,true)}}><label>Image (JPEG, PNG, WebP; max 2 MB)<input style={inputStyle} type="file" name="photo" accept="image/jpeg,image/png,image/webp" required onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label><label>Stage<select style={inputStyle} name="stage">{['Before','During','After','Inspection'].map(s=><option key={s}>{s}</option>)}</select></label><label>Caption<input style={inputStyle} name="caption" maxLength="500"/></label><label>Latitude<input style={inputStyle} type="number" step="any" required value={gps.latitude} onChange={e=>setGps({...gps,latitude:e.target.value})}/></label><label>Longitude<input style={inputStyle} type="number" step="any" required value={gps.longitude} onChange={e=>setGps({...gps,longitude:e.target.value})}/></label><button className="button secondary" type="button" onClick={()=>navigator.geolocation?.getCurrentPosition(p=>setGps({latitude:String(p.coords.latitude),longitude:String(p.coords.longitude)}),()=>setError('Location permission denied. Enter coordinates manually.'))}>Use my GPS</button><label>Capture date/time<input style={inputStyle} type="datetime-local" name="capturedAt" required/></label><button className="button primary" disabled={busy||!photo}>Upload image</button></form>}
      {record.evidence.map(e=><p key={e._id}><strong>{e.stage}</strong> · {e.caption} · GPS {e.latitude}, {e.longitude} · {new Date(e.capturedAt).toLocaleString()} · <button className="button secondary" onClick={async()=>{try{const base=import.meta.env.VITE_API_BASE_URL||'';const r=await fetch(`${base}/api/enhancements/evidence/${e._id}/image`,{headers:{Authorization:`Bearer ${session.token}`}});if(!r.ok)throw new Error('Unable to open photo');const u=URL.createObjectURL(await r.blob());window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000)}catch(err){setError(err.message)}}}>View photo</button></p>)}</article>
    </>}
  </div>
}
