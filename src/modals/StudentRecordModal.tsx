import { useEffect, useState, useRef } from "preact/hooks";
import { WidgetPortal } from "../components/WidgetPortal";

type Intent = "fee" | "marks" | "attendance" | "academic_review" | "academic_contacts";
type Flow = { open: boolean; intent: Intent; period: string; semester?: number | null };
type Student = { student_name: string; roll_number: string; registration_number: string };

const API = "https://voice.voicedots.io/student-demo/v1";

export default function StudentRecordModal({ flow, onClose, onLogin, onResult, authenticated = false, client = "demo" }: {
  flow: Flow;
  authenticated?: boolean;
  client?: "cmrtc" | "demo";
  onClose: () => void;
  onLogin: (token: string, expiresIn?: number) => void;
  onResult: (status: string, identifier: string) => void;
}) {
  const requestNumber = useRef(0);
  const [step, setStep] = useState<"phone" | "code" | "identifier" | "students" | "result">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);

  useEffect(() => {
    requestNumber.current += 1;
    if (flow.open) {
      setStep(authenticated || client === "cmrtc" ? "identifier" : "phone");
      setPhone(""); setCode(""); setDemoCode(null); setStudents([]);
      setIdentifier(""); setError(""); setNotice(""); setRecord(null); setLoading(false);
    }
  // Reset only when a new lookup flow opens or its requested record changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.open, flow.intent, flow.period, flow.semester, client]);

  if (!flow.open) return null;
  const isMarks = flow.intent === "marks";
  const label = isMarks && client !== "cmrtc" ? "Registration Number" : "Roll Number";

  const requestCode = async () => {
    if (phone.replace(/\D/g, "").length < 10) { setError("Enter a valid registered mobile number."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API}/verify/request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await response.json();
      if (data.status === "sent") {
        setDemoCode(data.demo_code ?? null); setStep("code");
        setNotice(`Verification code sent to ${data.phone_masked}.`);
      } else if (data.status === "not_registered") {
        setNotice("This number is not linked to a student record. You can continue with the student's register number.");
        setStep("identifier");
      } else {
        setError(data.status === "invalid_phone" ? "Enter a valid mobile number." : "Could not send a code. Please try again.");
      }
    } catch {
      setError("Could not reach the phone verification service.");
    } finally { setLoading(false); }
  };

  const lookup = async (value = identifier) => {
    const clean = value.trim();
    if (!clean) { setError(`Enter the student's ${label.toLowerCase()}.`); return; }
    const requestId = ++requestNumber.current;
    setLoading(true); setError(""); setRecord(null); setStep("result");
    try {
      const params = new URLSearchParams();
      if (flow.intent === "attendance") params.set("period", flow.period);
      if (flow.intent === "marks" && flow.semester != null) params.set("semester", String(flow.semester));
      const suffix = params.size ? `?${params.toString()}` : "";
      const response = client === "cmrtc"
        ? await fetch("https://voice.voicedots.io/cmrtc-records/v1/lookup", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: clean, record_type: flow.intent, period: flow.period }),
          })
        : await fetch(`${API}/records/${flow.intent}/${encodeURIComponent(clean)}${suffix}`);
      if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
      const data = await response.json();
      if (requestId !== requestNumber.current) return;
      if (data.status !== "found") {
        setError(data.message || (data.status === "semester_not_found"
          ? `No report is stored for semester ${data.requested_semester}.`
          : `No student record was found for ${clean}.`));
        onResult(client === "cmrtc" ? data.status : "empty", clean); setStep("identifier"); return;
      }
      setRecord(data); onResult("shown", clean);
    } catch (e: any) {
      if (requestId !== requestNumber.current) return;
      setError(e?.message || "Unable to load student details."); onResult("error", clean); setStep("identifier");
    } finally { if (requestId === requestNumber.current) setLoading(false); }
  };

  const confirmCode = async () => {
    if (!code.trim()) { setError("Enter the verification code."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/verify/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "verified") {
        const detail = data?.detail ?? data;
        setError(detail?.status === "invalid_code"
          ? `Incorrect code. ${detail.attempts_left ?? 0} attempt(s) left.`
          : detail?.status === "expired" ? "That code has expired. Request a new one."
          : detail?.status === "too_many_attempts" ? "Too many attempts. Request a new code."
          : "Phone verification failed. Please try again.");
        return;
      }
      const linked = Array.isArray(data.students) ? data.students.filter((s: Student) =>
        isMarks ? s.registration_number : s.roll_number) : [];
      if (!linked.length) { setError("No student record is linked to this number."); return; }
      onLogin(data.session_token, data.expires_in);
      setStudents(linked);
      if (linked.length === 1) {
        const value = isMarks ? linked[0].registration_number : linked[0].roll_number;
        setIdentifier(value); await lookup(value);
      } else setStep("students");
    } catch {
      setError("Could not reach the phone verification service.");
    } finally { setLoading(false); }
  };

  const fields = record ? Object.entries(record).filter(([key, value]) =>
    !["status", "provider", "record_type", "student_id", "subjects", "hours", "days",
      "academic_contacts", "subject_faculty"].includes(key) && typeof value !== "object") : [];

  return (
    <WidgetPortal>
      <div className="vd-student-overlay" role="dialog" aria-modal="true">
        <div className="vd-student-backdrop" onClick={onClose} />
        <div className="vd-student-card">
          <button className="vd-student-close" onClick={onClose} aria-label="Close">×</button>
          {step === "phone" && <>
            <h2>Verify Your Number</h2><p>Use the mobile number registered with the college.</p>
            <label>Registered Mobile Number</label>
            <input type="tel" inputMode="tel" autoFocus placeholder="e.g. +91 98765 43210" value={phone}
              onInput={(e: any) => setPhone(e.currentTarget.value)} onKeyDown={(e: any) => e.key === "Enter" && requestCode()} />
            {notice && <div className="vd-student-notice">{notice}</div>}
            {error && <div className="vd-student-error">{error}</div>}
            <button className="vd-student-primary" disabled={loading} onClick={requestCode}>{loading ? "Sending…" : "Send Verification Code"}</button>
            <button className="vd-student-secondary" onClick={() => { setStep("identifier"); setError(""); }}>Continue with student {label.toLowerCase()}</button>
          </>}
          {step === "code" && <>
            <h2>Enter Verification Code</h2><p>Enter the code sent to {notice.replace("Verification code sent to ", "").replace(".", "")}.</p>
            <label>One-Time Code</label><input autoFocus inputMode="numeric" maxLength={6} value={code}
              onInput={(e: any) => setCode(e.currentTarget.value.replace(/\D/g, ""))}
              onKeyDown={(e: any) => e.key === "Enter" && confirmCode()} />
            {demoCode && <div className="vd-student-notice">Demo mode — your code is <strong>{demoCode}</strong></div>}
            {error && <div className="vd-student-error">{error}</div>}
            <button className="vd-student-primary" disabled={loading} onClick={confirmCode}>{loading ? "Verifying…" : "Verify Number"}</button>
            <button className="vd-student-secondary" onClick={() => { setStep("phone"); setCode(""); setError(""); }}>Use a different number</button>
          </>}
          {step === "identifier" && <>
            <h2>{isMarks ? "Examination Results" : flow.intent === "attendance" ? `${flow.period[0].toUpperCase()}${flow.period.slice(1)} Attendance` : flow.intent === "fee" ? "Fee Details" : flow.intent === "academic_review" ? "Academic Review" : "Academic Contacts"}</h2>
            <p>Enter the student’s {label.toLowerCase()}.</p>
            <label>{label}</label><input autoFocus placeholder={client === "cmrtc" ? "Enter your CMRTC college roll number" : isMarks ? "e.g. SP23CSU155" : "e.g. SPC25CSU055"}
              value={identifier} onInput={(e: any) => setIdentifier(e.currentTarget.value.toUpperCase())}
              onKeyDown={(e: any) => e.key === "Enter" && lookup()} />
            {notice && <div className="vd-student-notice">{notice}</div>}
            {error && <div className="vd-student-error">{error}</div>}
            <button className="vd-student-primary" disabled={loading} onClick={() => lookup()}>{loading ? "Loading…" : "View Details"}</button>
            {client !== "cmrtc" && !authenticated && <button className="vd-student-secondary" onClick={() => { setStep("phone"); setError(""); }}>Verify with mobile number</button>}
          </>}
          {step === "students" && <>
            <h2>Select Student</h2><p>This number is linked to more than one student. Choose a report.</p>
            {students.map((student) => {
              const value = isMarks ? student.registration_number : student.roll_number;
              return <button className="vd-student-secondary" key={value} disabled={loading} onClick={() => { setIdentifier(value); void lookup(value); }}>
                {student.student_name} · {value}
              </button>;
            })}
            {error && <div className="vd-student-error">{error}</div>}
          </>}
          {step === "result" && <>
            {loading ? <><h2>Loading Report</h2><p>Fetching the requested student record…</p></> : record ? <>
              <h2>{isMarks ? `Semester ${record.semester ?? flow.semester ?? ""} Report Card` : record.student_name}</h2><p>{record.student_name} · {record.department}</p>
              <div className="vd-student-results">
                {record.subject_attendance?.map((s: any) => <div className="vd-student-row" key={s.subject}><span>{s.subject}</span><strong>{s.reported_value}</strong></div>)}
                {record.reports?.map((r: any) => <section key={r.report_id}><h3>{r.title}</h3><p>Source page {r.page}</p><img src={r.image} alt={`${r.title} — academic report`} style={{width: "100%", height: "auto"}} /></section>)}
                {fields.map(([key, value]) => <div className="vd-student-row" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{String(value)}</strong></div>)}
                {Array.isArray(record.subjects) && record.subjects.map((s: any) =>
                  <div className="vd-student-row" key={s.subject}><span>{s.subject}</span><strong>{s.marks} — {s.grade}</strong></div>)}
                {Array.isArray(record.hours) && record.hours.map((h: any) =>
                  <div className="vd-student-row" key={h.hour}><span>Hour {h.hour}: {h.subject}</span><strong>{h.status}</strong></div>)}
                {Array.isArray(record.days) && record.days.map((d: any) =>
                  <div className="vd-student-row" key={d.day}><span>Day {d.day}</span><strong>{d.hours_present}/{d.hours_conducted} present</strong></div>)}
              </div>
              <button className="vd-student-primary" onClick={onClose}>Close</button>
            </> : <>
              <h2>Report Unavailable</h2>{error && <div className="vd-student-error">{error}</div>}
              <button className="vd-student-primary" onClick={() => setStep("identifier")}>Try another {label.toLowerCase()}</button>
            </>}
          </>}
        </div>
      </div>
    </WidgetPortal>
  );
}
