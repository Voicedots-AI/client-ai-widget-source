import { useEffect, useRef, useState } from 'preact/hooks';
import { WidgetPortal } from '../components/WidgetPortal';
import styles from '../styles/staff-attendance.css?inline';

type SelfAttendance = { attendance_date: string; checked_in_at: string | null };
type Class = { id: string; name: string; subject: string };
type Status = 'present' | 'absent' | 'od' | 'unmarked';
type Register = { revision: number; record: { updated_at: string } | null; students: { id: string; full_name: string; roll_number: string; status: Status }[] };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function StaffAttendanceModal({ workspace, onClose, voiceMode = false, voiceConnected = false, onVerified, attendanceRevision = 0 }: { workspace: string; onClose: () => void; voiceMode?: boolean; voiceConnected?: boolean; onVerified?: (token: string) => void; attendanceRevision?: number }) {
  const base = `https://student-api.voicedots.io/api/widget/attendance/${encodeURIComponent(workspace)}`;
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
  const [selfAttendance, setSelfAttendance] = useState<SelfAttendance | null>(null);
  const [selfError, setSelfError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [camera, setCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const recognition = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState('');
  const [day, setDay] = useState(today);
  const [period, setPeriod] = useState('1');
  const [register, setRegister] = useState<Register | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [transcript, setTranscript] = useState('');
  const [reload, setReload] = useState(0);
  const request = async <T,>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) { tokenRef.current = ''; setToken(''); setRegister(null); }
      throw new Error(typeof data.detail === 'string' ? data.detail : data.detail?.message || 'Unable to complete this request. Please retry.');
    }
    return data;
  };
  const stopCamera = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCamera(false); setCameraReady(false); };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; stream.current?.getTracks().forEach(t => t.stop());
      if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); }
      if (tokenRef.current) void fetch(base + '/logout', { method: 'POST', headers: { Authorization: `Bearer ${tokenRef.current}` }, keepalive: true }).catch(() => {});
      tokenRef.current = '';
    };
  }, []);
  useEffect(() => { if (camera && video.current) video.current.srcObject = stream.current; }, [camera]);
  const startCamera = async () => {
    setError(''); setBusy(true);
    try {
      const feed = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 960 }, audio: false });
      if (!alive.current) { feed.getTracks().forEach(t => t.stop()); return; }
      stream.current = feed; setCamera(true);
    } catch { setError('Allow camera access in your browser, then try again.'); } finally { setBusy(false); }
  };
  const login = async () => {
    if (!video.current?.videoWidth) { setError('Wait for the webcam picture before capturing.'); return; }
    setBusy(true); setError('');
    try {
      const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      canvas.getContext('2d')!.drawImage(video.current, 0, 0);
      const session = await request<{ token: string; full_name: string }>('/login', { email, photo: canvas.toDataURL('image/jpeg', .9) });
      if (!alive.current) { void fetch(base + '/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }).catch(() => {}); return; }
      tokenRef.current = session.token; setToken(session.token); setName(session.full_name); stopCamera();
      if (voiceMode) onVerified?.(session.token);
      if (voiceMode) return;
      const result = await request<{ classes: Class[] }>('/classes'); setClasses(result.classes); setClassId(result.classes[0]?.id || '');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!token || !classId || !day) return;
    const controller = new AbortController(); setRegister(null); setError(''); setNotice(''); setTranscript('');
    request<Register>(`/record?class_id=${encodeURIComponent(classId)}&attendance_date=${day}&period=${period}`, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setRegister(data); setMarks(Object.fromEntries(data.students.map(s => [s.id, s.status]))); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token, classId, day, period, reload]);
  const loadSelf = async () => {
    setSelfError('');
    try { const data = await request<SelfAttendance>('/self'); if (alive.current) setSelfAttendance(data); }
    catch (e) { if (alive.current) setSelfError((e as Error).message); }
  };
  useEffect(() => { if (token) void loadSelf(); else setSelfAttendance(null); }, [token, attendanceRevision]);
  useEffect(() => { if (voiceMode && !voiceConnected) onClose(); }, [voiceMode, voiceConnected]);
  const markSelf = async () => {
    setBusy(true); setSelfError('');
    try { const data = await request<SelfAttendance>('/self', {}); if (alive.current) setSelfAttendance(data); }
    catch (e) { if (alive.current) setSelfError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  };
  const save = async (spoken?: string) => {
    if (!register) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request<Register>('/record', { class_id: classId, attendance_date: day, period: Number(period), expected_revision: register.revision,
        ...(spoken === undefined ? { marks } : { transcript: spoken }) });
      if (!alive.current) return;
      setRegister(data); setMarks(Object.fromEntries(data.students.map(s => [s.id, s.status])));
      setNotice(`Saved: ${data.students.filter(s => s.status === 'present').length} present, ${data.students.filter(s => s.status === 'absent').length} absent, ${data.students.filter(s => s.status === 'od').length} on duty.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const dictate = () => {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) { setError('Voice entry is available in Chrome. You can also type the absent names below.'); return; }
    setError(''); setNotice(''); setTranscript('');
    const recognizer = new Speech(); recognition.current = recognizer;
    recognizer.lang = 'en-IN'; recognizer.continuous = true; recognizer.interimResults = true;
    let finalWords = ''; let failed = false;
    recognizer.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalWords += event.results[i][0].transcript + ' ';
        else interim += event.results[i][0].transcript;
      }
      setTranscript((finalWords + interim).trim());
    };
    recognizer.onerror = (event: any) => { failed = true; setError(event.error === 'not-allowed' ? 'Allow microphone access, or type the names.' : 'Voice capture stopped. Try again or type the names.'); };
    recognizer.onend = () => { setListening(false); recognition.current = null; if (alive.current && !failed && finalWords.trim()) void save(finalWords.trim()); };
    try { recognizer.start(); setListening(true); } catch { setError('Microphone could not start. Try again.'); }
  };
  const frozen = busy || listening;
  const counts = (value: Status) => Object.values(marks).filter(s => s === value).length;
  // Keep the session lifecycle mounted while returning focus to the voice call.
  if (voiceMode && token) return null;
  return <WidgetPortal><style>{styles}</style><div className="vd-staff-overlay"><section className="vd-staff-panel" style={voiceMode ? { maxWidth: "440px" } : undefined} role="dialog" aria-modal="true" aria-labelledby="vd-staff-title">
    <header><div><small>{voiceMode ? "YOUR STAFF SPACE" : "DSCET · Staff workspace"}</small><h2 id="vd-staff-title">{voiceMode ? (camera ? "Verify your photo." : "Sign in with your face.") : "Attendance"}</h2></div><button onClick={onClose} aria-label="Close staff attendance">✕</button></header>
    {error && <p className="vd-staff-error" role="alert">{error}</p>}{notice && <p className="vd-staff-success" role="status">{notice}</p>}
    {!token ? <form onSubmit={e => { e.preventDefault(); if (camera) void login(); else void startCamera(); }}>
      <p>{voiceMode ? (camera ? "One more step to verify your identity. Your AI conversation stays connected." : "Enter your email, then capture a camera photo to sign in.") : "Your administrator adds your staff name, email, photo and classes in the client dashboard."}</p>
      <label>Email<input type="email" required value={email} onInput={e => setEmail(e.currentTarget.value)} autoComplete="email" disabled={busy} /></label>
      {camera && <video ref={video} autoPlay playsInline muted aria-label="Camera preview" onCanPlay={() => setCameraReady(true)} onEmptied={() => setCameraReady(false)} />}
      <p className="vd-staff-hint">Face the camera with one face clearly visible. A frame from this feed is compared with your saved staff photo.</p>
      {camera ? <button className="vd-staff-primary" type="submit" disabled={busy || !email || !cameraReady}>{busy ? 'Verifying photo…' : 'Capture and verify'}</button> : <button className="vd-staff-primary" type="submit" disabled={busy || !email}>Open camera</button>}
      {camera && <button type="button" disabled={busy} onClick={() => { stopCamera(); setError(''); }}>Back to sign in</button>}
    </form> : <>
      <p className="vd-staff-verified">✓ Photo verified · {name}</p>
      <section className="vd-staff-voice" aria-label="My attendance">
        <h3>My attendance</h3>
        <p>Mark your own attendance for today. Date and time use India Standard Time.</p>
        {selfError && <p role="alert" className="vd-staff-error">{selfError}</p>}
        {selfAttendance?.checked_in_at
          ? <p role="status" className="vd-staff-verified">Present · {selfAttendance.attendance_date} · {new Date(selfAttendance.checked_in_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
          : voiceMode ? <p>Keep speaking with the AI. When it asks, say “Yes, mark my attendance.” Your saved confirmation will appear here.</p> : <button className="vd-staff-primary" disabled={busy || !selfAttendance} onClick={() => void markSelf()}>{busy ? 'Saving…' : 'Mark my attendance'}</button>}
        <button disabled={busy} onClick={() => void loadSelf()}>Refresh my attendance</button>
      </section>
      {!voiceMode && <>
      <h3>Student class attendance</h3>
      {!classes.length ? <p>No classes are assigned yet. Ask your administrator to assign your classes in the client dashboard.</p> : <>
        <label>Class<select value={classId} disabled={frozen} onChange={e => setClassId(e.currentTarget.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.subject ? ` · ${c.subject}` : ''}</option>)}</select></label>
        <div className="vd-staff-fields"><label>Date<input type="date" value={day} disabled={frozen} onChange={e => setDay(e.currentTarget.value)} /></label><label>Hour / period<select value={period} disabled={frozen} onChange={e => setPeriod(e.currentTarget.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Hour {i + 1}</option>)}</select></label></div>
        {register && <>
          <div className="vd-staff-counts"><span>Present: {counts('present')}</span><span>Absent: {counts('absent')}</span><span>OD: {counts('od')}</span><strong>Total: {register.students.length}</strong></div>
          <div className="vd-staff-voice"><h3>Say the absent names</h3><p>Say all absent students for this class and period, using the full names below. Everyone else is marked present. Say “all present” if nobody is absent.</p>
            <button className="vd-staff-primary" disabled={busy} onClick={() => listening ? recognition.current?.stop() : dictate()}>{listening ? 'Stop & save attendance' : '🎙 Speak absent names'}</button>
            <label>Absent names<textarea value={transcript} disabled={frozen} onInput={e => setTranscript(e.currentTarget.value)} placeholder="e.g. Vivek and DSCET Test Student are absent" rows={2} /></label>
            <button disabled={frozen || !transcript.trim()} onClick={() => void save(transcript)}>Save typed names</button><p className="vd-staff-hint">Voice entry saves automatically when you stop. Unknown or duplicate names must be corrected before anything is saved.</p>
          </div>
          <div className="vd-staff-table"><table><thead><tr><th>Roll No.</th><th>Name</th><th>P / A / OD</th></tr></thead><tbody>{register.students.map(s => <tr key={s.id}><td>{s.roll_number}</td><td>{s.full_name}</td><td><select aria-label={`Attendance for ${s.full_name}`} value={marks[s.id]} disabled={frozen} onChange={e => setMarks(m => ({ ...m, [s.id]: e.currentTarget.value as Status }))}><option value="unmarked">Unmarked</option><option value="present">Present</option><option value="absent">Absent</option><option value="od">On duty</option></select></td></tr>)}</tbody></table></div>
          <footer><button disabled={frozen} onClick={() => setMarks(Object.fromEntries(register.students.map(s => [s.id, 'present'])))}>Present all</button><button className="vd-staff-primary" disabled={frozen || !register.students.length || counts('unmarked') > 0} onClick={() => void save()}>{busy ? 'Saving…' : 'Save table'}</button></footer>
          <p className="vd-staff-hint">{register.record ? `Saved ${new Date(register.record.updated_at).toLocaleString()}. Visible in the client dashboard.` : 'No attendance saved for this period yet.'}</p>
        </>}
        <button disabled={frozen} onClick={() => setReload(n => n + 1)}>Reload register</button>
      </>}
      </>}
      <p className="vd-staff-hint">Closing this panel signs you out. Face verification expires after 30 minutes.</p>
    </>}
  </section></div></WidgetPortal>;
}
