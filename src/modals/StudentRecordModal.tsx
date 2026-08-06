import { useEffect, useState } from "preact/hooks";
import { WidgetPortal } from "../components/WidgetPortal";

type Intent = "fee" | "marks" | "attendance" | "academic_review" | "academic_contacts";
type Flow = { open: boolean; intent: Intent; period: string };

const API = "https://voice.voicedots.io/student-demo/v1";

export default function StudentRecordModal({ flow, onClose, onLogin, onResult }: {
  flow: Flow;
  onClose: () => void;
  onLogin: () => void;
  onResult: (status: string, identifier: string) => void;
}) {
  const [step, setStep] = useState<"login" | "identifier" | "result">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);

  useEffect(() => {
    if (flow.open) {
      setStep("login"); setUsername(""); setPassword(""); setIdentifier("");
      setError(""); setRecord(null); setLoading(false);
    }
  }, [flow.open, flow.intent, flow.period]);

  if (!flow.open) return null;
  const isMarks = flow.intent === "marks";
  const label = isMarks ? "Registration Number" : "Roll Number";

  const login = () => {
    if (username !== "admin" || password !== "Ind123Ind@") {
      setError("Invalid username or password"); return;
    }
    setError(""); setStep("identifier"); onLogin();
  };

  const lookup = async () => {
    const clean = identifier.trim();
    if (!clean) { setError(`Enter the student's ${label}.`); return; }
    setLoading(true); setError("");
    try {
      const suffix = flow.intent === "attendance" ? `?period=${encodeURIComponent(flow.period)}` : "";
      const response = await fetch(`${API}/records/${flow.intent}/${encodeURIComponent(clean)}${suffix}`);
      if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
      const data = await response.json();
      if (data.status !== "found") {
        setError(`No student record was found for ${clean}.`); onResult("empty", clean); return;
      }
      setRecord(data); setStep("result"); onResult("shown", clean);
    } catch (e: any) {
      setError(e?.message || "Unable to load student details."); onResult("error", clean);
    } finally { setLoading(false); }
  };

  const fields = record ? Object.entries(record).filter(([key, value]) =>
    !["status", "provider", "record_type", "student_id", "subjects", "hours", "days",
      "academic_contacts", "subject_faculty"].includes(key) &&
    typeof value !== "object") : [];

  return (
    <WidgetPortal>
      <div className="vd-student-overlay" role="dialog" aria-modal="true">
        <div className="vd-student-backdrop" onClick={onClose} />
        <div className="vd-student-card">
          <button className="vd-student-close" onClick={onClose} aria-label="Close">×</button>
          {step === "login" && <>
            <h2>Student Records</h2><p>Sign in to access the demonstration.</p>
            <label>Username</label><input autoFocus value={username} onInput={(e: any) => setUsername(e.currentTarget.value)} />
            <label>Password</label><input type="password" value={password} onInput={(e: any) => setPassword(e.currentTarget.value)}
              onKeyDown={(e: any) => e.key === "Enter" && login()} />
            {error && <div className="vd-student-error">{error}</div>}
            <button className="vd-student-primary" onClick={login}>Access Student Records</button>
          </>}
          {step === "identifier" && <>
            <h2>{flow.intent === "marks" ? "Examination Results" : flow.intent === "attendance" ? `${flow.period[0].toUpperCase()}${flow.period.slice(1)} Attendance` : flow.intent === "fee" ? "Fee Details" : flow.intent === "academic_review" ? "Academic Review" : "Academic Contacts"}</h2>
            <p>Enter the student’s {label.toLowerCase()}.</p>
            <label>{label}</label><input autoFocus placeholder={isMarks ? "e.g. SP23CSU155" : "e.g. SPC25CSU055"}
              value={identifier} onInput={(e: any) => setIdentifier(e.currentTarget.value.toUpperCase())}
              onKeyDown={(e: any) => e.key === "Enter" && lookup()} />
            {error && <div className="vd-student-error">{error}</div>}
            <button className="vd-student-primary" disabled={loading} onClick={lookup}>{loading ? "Loading…" : "View Details"}</button>
          </>}
          {step === "result" && record && <>
            <h2>{record.student_name}</h2><p>{record.department}</p>
            <div className="vd-student-results">
              {fields.map(([key, value]) => <div className="vd-student-row" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{String(value)}</strong></div>)}
              {Array.isArray(record.subjects) && record.subjects.map((s: any) =>
                <div className="vd-student-row" key={s.subject}><span>{s.subject}</span><strong>{s.marks} — {s.grade}</strong></div>)}
              {Array.isArray(record.hours) && record.hours.map((h: any) =>
                <div className="vd-student-row" key={h.hour}><span>Hour {h.hour}: {h.subject}</span><strong>{h.status}</strong></div>)}
              {Array.isArray(record.days) && record.days.map((d: any) =>
                <div className="vd-student-row" key={d.day}><span>{d.day}</span><strong>{d.hours_present}/{d.hours_conducted} present</strong></div>)}
            </div>
            <button className="vd-student-primary" onClick={onClose}>Close</button>
          </>}
        </div>
      </div>
    </WidgetPortal>
  );
}
