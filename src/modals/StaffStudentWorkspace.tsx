import { useEffect, useState } from 'preact/hooks';

type Class = { id: string; name: string; subject: string };
type Student = { id: string; full_name: string; roll_number: string; email: string; phone: string; program: string; department_code: string; graduation_year: number; cgpa: number; date_of_birth?: string | null; status: string };
type Program = { code: string; display_name: string; departments: { code: string; display_name: string }[] };
type Payment = { id: string; amount: number; paid_on: string; reference: string; note: string };
type Mark = { id: string; subject: string; exam: string; score: number; maximum: number; exam_date: string; semester?: number | null };
type Records = { total_fee: number; amount_paid: number; balance: number; payments: Payment[]; marks: Mark[]; fee_history: { previous_total: number; new_total: number; changed_at: string }[] };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount));

export default function StaffStudentWorkspace({ base, token, classes, onUnauthorized, onRosterChanged }: {
  base: string; token: string; classes: Class[]; onUnauthorized: () => void; onRosterChanged: () => void;
}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [feeTotal, setFeeTotal] = useState('');
  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentEdit, setPaymentEdit] = useState<Payment | null>(null);
  const [markEdit, setMarkEdit] = useState<Mark | null>(null);

  async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const detail = data.detail;
      throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Could not save this record. Please try again.');
    }
    return data as T;
  }
  async function loadStudents(q = search, page = offset) {
    const params = new URLSearchParams({ q, limit: '50', offset: String(page) });
    const data = await api<{ items: Student[]; total: number }>(`/students?${params}`);
    setStudents(data.items); setTotal(data.total);
  }
  async function loadRecords(student: Student) {
    const data = await api<Records>(`/students/${student.id}/records`);
    setRecords(data); setFeeTotal(String(data.total_fee));
  }
  useEffect(() => {
    let active = true;
    api<{ programs: Program[]; departments: string[] }>('/student-catalog').then(data => {
      if (active) { setPrograms(data.programs); setDepartments(data.departments); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base, token]);
  useEffect(() => {
    const timer = setTimeout(() => { void loadStudents(search, offset).catch(e => setError(e.message)); }, 180);
    return () => clearTimeout(timer);
  }, [base, token, search, offset]);
  function openNew() {
    setEditing('new'); setSelected(null); setError(''); setNotice(''); setPhoto('');
    const first = programs[0]; setProgram(first?.code || '');
    setDepartment(first?.departments[0]?.code || departments[0] || '');
  }
  async function readPhoto(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG or PNG photo up to 2 MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.onerror = () => setError('Could not read the photo.');
    reader.readAsDataURL(file);
  }
  async function saveStudent(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    if (editing === 'new' && !photo) { setError('Add a clear student reference photo.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (editing === 'new') {
        await api('/students', 'POST', { details: {
          full_name: String(values.get('full_name') || '').trim(), roll_number: String(values.get('roll_number') || '').trim(),
          email: String(values.get('email') || '').trim(), phone: String(values.get('phone') || '').trim(),
          program, department_code: department, cgpa: Number(values.get('cgpa')),
          graduation_year: Number(values.get('graduation_year')), date_of_birth: values.get('date_of_birth') || null,
          status: 'active', photo,
        }, class_id: values.get('class_id') || null });
        onRosterChanged(); setNotice('Student added to your department. Open the record to enter fees, payments and marks.');
      } else if (editing) {
        await api(`/students/${editing.id}`, 'PUT', {
          full_name: String(values.get('full_name') || '').trim(), phone: String(values.get('phone') || '').trim(),
          cgpa: Number(values.get('cgpa')), graduation_year: Number(values.get('graduation_year')),
          date_of_birth: values.get('date_of_birth') || null, status: values.get('status'),
        });
        setNotice('Student details updated.');
      }
      setEditing(null); setPhoto(''); await loadStudents();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveRecord(path: string, method: 'POST' | 'PUT', body: unknown, form?: HTMLFormElement) {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, method, body); await loadRecords(selected);
      setPaymentEdit(null); setMarkEdit(null); form?.reset(); setNotice('Student record saved.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function assignClass(student: Student, classId: string) {
    if (!classId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/students/${student.id}/classes`, 'POST', { class_id: classId });
      onRosterChanged(); setNotice(`${student.full_name} added to the class.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function savePayment(event: Event) {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const values = new FormData(form);
    void saveRecord(`/students/${selected!.id}/payments${paymentEdit ? `/${paymentEdit.id}` : ''}`, paymentEdit ? 'PUT' : 'POST', {
      amount: Number(values.get('amount')), paid_on: values.get('paid_on'),
      reference: values.get('reference'), note: values.get('note'),
    }, form);
  }
  function saveMark(event: Event) {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const values = new FormData(form);
    const score = Number(values.get('score')), maximum = Number(values.get('maximum'));
    if (score > maximum) { setError('Score cannot exceed maximum marks.'); return; }
    void saveRecord(`/students/${selected!.id}/marks${markEdit ? `/${markEdit.id}` : ''}`, markEdit ? 'PUT' : 'POST', {
      subject: values.get('subject'), exam: values.get('exam'), score, maximum, exam_date: values.get('exam_date'), semester: Number(values.get('semester')),
    }, form);
  }
  const currentProgram = programs.find(item => item.code === program);
  return <section aria-label="Student records">
    <div className="vd-staff-counts"><h3>Students, marks and fees</h3><button type="button" className="vd-staff-primary" disabled={busy || !departments.length} onClick={openNew}>Add student</button></div>
    {error && <p className="vd-staff-error" role="alert">{error}</p>}
    {notice && <p className="vd-staff-success" role="status">{notice}</p>}
    {!departments.length && <p>No department can be determined from your assigned classes. Each class must contain students from one department.</p>}
    {!editing && !selected && <>
      <label>Search students<input value={search} onInput={e => { setOffset(0); setSearch(e.currentTarget.value); }} placeholder="Name or roll number" /></label>
      <p className="vd-staff-hint">You can manage students in: {departments.join(', ') || 'no department assigned'}.</p>
      <div className="vd-staff-table"><table><thead><tr><th>Roll no.</th><th>Name</th><th>Department</th><th>Actions</th></tr></thead><tbody>{students.map(student => <tr key={student.id}><td>{student.roll_number}</td><td>{student.full_name}</td><td>{student.department_code}</td><td><button type="button" onClick={() => { setEditing(student); setError(''); }}>Edit</button> <button type="button" onClick={() => { setSelected(student); setRecords(null); setError(''); void loadRecords(student).catch(e => setError(e.message)); }}>Marks & fees</button> <select aria-label={`Add ${student.full_name} to class`} value="" disabled={busy} onChange={e => void assignClass(student, e.currentTarget.value)}><option value="">Add to class…</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td></tr>)}</tbody></table></div>
      {!students.length && <p>No students found.</p>}
      <footer><span>{total ? `${offset + 1}–${Math.min(offset + 50, total)} of ${total}` : '0 students'}</span><div><button type="button" disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button> <button type="button" disabled={offset + 50 >= total || busy} onClick={() => setOffset(offset + 50)}>Next</button></div></footer>
    </>}
    {editing && <form onSubmit={saveStudent}>
      <h3>{editing === 'new' ? 'Add student' : `Edit ${editing.full_name}`}</h3>
      <div className="vd-staff-fields">
        <label>Full name *<input name="full_name" required defaultValue={editing === 'new' ? '' : editing.full_name}/></label>
        {editing === 'new' && <label>Roll number *<input name="roll_number" required/></label>}
        {editing === 'new' && <label>Email *<input name="email" type="email" required/></label>}
        <label>Registered mobile number with country code *<input name="phone" type="tel" required defaultValue={editing === 'new' ? '' : editing.phone}/></label>
        {editing === 'new' && <label>Program *<select value={program} onChange={e => { const code = e.currentTarget.value; setProgram(code); setDepartment(programs.find(p => p.code === code)?.departments[0]?.code || ''); }} required>{programs.map(p => <option key={p.code} value={p.code}>{p.display_name}</option>)}</select></label>}
        {editing === 'new' && <label>Department *<select value={department} onChange={e => setDepartment(e.currentTarget.value)} required>{currentProgram?.departments.map(d => <option key={d.code} value={d.code}>{d.display_name}</option>)}</select></label>}
        {editing === 'new' && <label>Class (optional)<select name="class_id"><option value="">Assign later</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>)}</select></label>}
        <label>Graduation year *<input name="graduation_year" type="number" min="2000" max="2100" required defaultValue={editing === 'new' ? new Date().getFullYear() + 1 : editing.graduation_year}/></label>
        <label>CGPA *<input name="cgpa" type="number" min="0" max="10" step="0.01" required defaultValue={editing === 'new' ? '' : editing.cgpa}/></label>
        <label>Date of birth<input name="date_of_birth" type="date" max={today()} defaultValue={editing === 'new' ? '' : editing.date_of_birth?.slice(0, 10) || ''}/></label>
        {editing === 'new' ? <label>Reference photo *<input type="file" accept="image/jpeg,image/png" required onChange={e => void readPhoto(e.currentTarget.files?.[0])}/>{photo && <small>Photo ready</small>}</label> : <label>Status<select name="status" defaultValue={editing.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="placed">Placed</option></select></label>}
      </div>
      <footer><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="vd-staff-primary" disabled={busy || (editing === 'new' && !photo)}>{busy ? 'Saving…' : 'Save student'}</button></footer>
    </form>}
    {selected && <>
      <div className="vd-staff-counts"><div><h3>{selected.full_name}</h3><small>{selected.roll_number} · {selected.department_code}</small></div><button type="button" onClick={() => { setSelected(null); setRecords(null); }}>Back to students</button></div>
      {!records ? <p role="status">Loading student record…</p> : <>
        <div className="vd-staff-fields"><div><small>Total fee</small><h3>{money(records.total_fee)}</h3></div><div><small>Paid</small><h3>{money(records.amount_paid)}</h3></div><div><small>Balance</small><h3>{money(records.balance)}</h3></div></div>
        <form onSubmit={e => { e.preventDefault(); void saveRecord(`/students/${selected.id}/fee`, 'PUT', { total_fee: Number(feeTotal) }); }}><label>Total fee (INR)<input type="number" min="0" step="0.01" required value={feeTotal} onInput={e => setFeeTotal(e.currentTarget.value)}/></label><button className="vd-staff-primary" disabled={busy}>Save total fee</button></form>
        <h3>Payments</h3><form key={paymentEdit?.id || 'new-payment'} onSubmit={savePayment}><div className="vd-staff-fields"><label>Amount *<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={paymentEdit?.amount}/></label><label>Paid on *<input name="paid_on" type="date" required defaultValue={paymentEdit?.paid_on || today()}/></label><label>Reference<input name="reference" maxLength={120} defaultValue={paymentEdit?.reference}/></label><label>Note<input name="note" maxLength={500} defaultValue={paymentEdit?.note}/></label></div><button className="vd-staff-primary" disabled={busy}>{paymentEdit ? 'Update payment' : 'Add payment'}</button>{paymentEdit && <button type="button" onClick={() => setPaymentEdit(null)}>Cancel edit</button>}</form>
        <div className="vd-staff-table"><table><thead><tr><th>Date</th><th>Amount</th><th>Reference</th><th></th></tr></thead><tbody>{records.payments.map(p => <tr key={p.id}><td>{p.paid_on}</td><td>{money(p.amount)}</td><td>{p.reference || '—'}</td><td><button type="button" onClick={() => setPaymentEdit(p)}>Edit</button></td></tr>)}</tbody></table></div>
        <h3>Academic marks</h3><form key={markEdit?.id || 'new-mark'} onSubmit={saveMark}><div className="vd-staff-fields"><label>Subject *<input name="subject" required maxLength={150} defaultValue={markEdit?.subject}/></label><label>Exam *<input name="exam" required maxLength={150} defaultValue={markEdit?.exam}/></label><label>Semester *<input name="semester" type="number" min="1" max="12" required defaultValue={markEdit?.semester ?? 1}/></label><label>Score *<input name="score" type="number" min="0" step="0.01" required defaultValue={markEdit?.score}/></label><label>Out of *<input name="maximum" type="number" min="0.01" step="0.01" required defaultValue={markEdit?.maximum}/></label><label>Exam date *<input name="exam_date" type="date" required defaultValue={markEdit?.exam_date || today()}/></label></div><button className="vd-staff-primary" disabled={busy}>{markEdit ? 'Update marks' : 'Add marks'}</button>{markEdit && <button type="button" onClick={() => setMarkEdit(null)}>Cancel edit</button>}</form>
        <div className="vd-staff-table"><table><thead><tr><th>Date</th><th>Semester</th><th>Subject</th><th>Exam</th><th>Marks</th><th></th></tr></thead><tbody>{records.marks.map(m => <tr key={m.id}><td>{m.exam_date}</td><td>{m.semester ?? "—"}</td><td>{m.subject}</td><td>{m.exam}</td><td>{m.score} / {m.maximum}</td><td><button type="button" onClick={() => setMarkEdit(m)}>Edit</button></td></tr>)}</tbody></table></div>
        {records.fee_history.length > 0 && <details><summary>Fee total history</summary><ul>{records.fee_history.map((h, index) => <li key={`${h.changed_at}-${index}`}>{new Date(h.changed_at).toLocaleString()}: {money(h.previous_total)} → {money(h.new_total)}</li>)}</ul></details>}
      </>}
    </>}
  </section>;
}
