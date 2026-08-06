import { useEffect, useState } from "preact/hooks";
import { X, Edit3, Loader2, CheckCircle2, Clock } from "lucide-preact";
import { WidgetPortal } from "../components/WidgetPortal";

interface DataCollectionModalProps {
  data: Record<string, string | number | null>;
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  title?: string;
  confirmed?: boolean;
}

export default function VoicedotsDataCollectionModal({
  data,
  isOpen,
  isLoading = false,
  onClose,
  title = "Verifying Your Information",
  confirmed = false,
}: DataCollectionModalProps) {
  const [displayData, setDisplayData] = useState<Record<string, string>>({});
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && data) {
      const newData: Record<string, string> = {};
      const changed = new Set<string>();

      Object.entries(data || {}).forEach(([k, v]) => {
        const newVal = v?.toString() ?? "";

        if (displayData[k] !== undefined && displayData[k] !== newVal) {
          changed.add(k);
        }

        newData[k] = newVal;
      });

      setDisplayData(newData);

      if (changed.size > 0) {
        setUpdatedFields(changed);
        const timer = setTimeout(() => setUpdatedFields(new Set()), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [data, isOpen]);

  if (!isOpen) return null;

  return (
    <WidgetPortal>
      <div className="vd-modal-overlay">
        {/* BACKDROP */}
        <div className="vd-modal-backdrop" onClick={onClose} />

        {/* CONTAINER */}
        <div className="vd-modal-container animate-zoom-in">
          <div className="vd-modal-glow" />

          {/* HEADER */}
          <div className="vd-modal-header">
            <div className="vd-modal-title-box">
              <div
                className="vd-modal-icon-wrapper"
                style={{
                  background: confirmed
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(124,77,255,0.1)",
                  color: confirmed ? "#10b981" : "#7c4dff",
                }}
              >
                {confirmed ? <CheckCircle2 size={20} /> : <Edit3 size={20} />}
              </div>

              <h3>
                {confirmed ? "Information Confirmed" : title}
              </h3>
            </div>

            <button onClick={onClose} className="vd-modal-close">
              <X size={20} />
            </button>
          </div>

          {/* CONTENT */}
          <div className="vd-modal-body custom-scrollbar">
            {isLoading ? (
              <div className="vd-modal-loader">
                <Loader2 className="vd-spin" size={32} />
                <p>Preparing fields...</p>
              </div>
            ) : (
              <div className="vd-form-grid">
                {Object.entries(displayData).map(([label, value]) => (
                  <div
                    key={label}
                    className="vd-input-group"
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: updatedFields.has(label)
                        ? "rgba(124,77,255,0.15)"
                        : "rgba(124,77,255,0.05)",
                      border: updatedFields.has(label)
                        ? "1px solid rgba(124,77,255,0.4)"
                        : "1px solid transparent",
                      transition: "all 0.4s ease",
                    }}
                  >
                    <label>{label.replace(/_/g, " ")}</label>

                    <p style={{ fontSize: "14px", minHeight: "20px" }}>
                      {value || (
                        <span style={{ opacity: 0.5, fontStyle: "italic" }}>
                          Waiting...
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="vd-modal-footer">
            <div
              className="vd-verify-badge"
              style={{
                color: confirmed ? "#10b981" : "#666",
              }}
            >
              {confirmed ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Confirmed & saved successfully</span>
                </>
              ) : (
                <>
                  <Clock size={14} className="vd-spin" />
                  <span>Waiting for verbal confirmation...</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </WidgetPortal>
  );
}