import { useEffect, useState } from "preact/hooks";
import { X, Save, Edit3, Loader2, ClipboardCheck } from "lucide-preact";
import { WidgetPortal } from "../components/WidgetPortal";

interface DataCollectionModalProps {
  data: Record<string, string | number | null>;
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  title?: string;
  onSubmit: (data: Record<string, string>) => void;
}

export default function DataCollectionModal({
  data,
  isOpen,
  isLoading = false,
  onClose,
  title = "Update Information",
  onSubmit,
}: DataCollectionModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Initialize only when the modal opens — re-running on every `data` change
  // would wipe what the user is typing if the agent pushes an update mid-edit.
  useEffect(() => {
    if (isOpen) {
      const initialData: Record<string, string> = {};
      Object.entries(data || {}).forEach(([k, v]) => {
        initialData[k] = v?.toString() ?? "";
      });
      setFormData(initialData);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const submitData = (e: any) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

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
              <div className="vd-modal-icon-wrapper">
                <Edit3 size={20} />
              </div>
              <h3>{title}</h3>
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
              <form onSubmit={submitData} className="vd-modal-form">
                <div className="vd-form-grid">
                  {Object.entries(formData).map(([label, value]) => (
                    <div key={label} className="vd-input-group">
                      <label>{label.replace(/_/g, " ")}</label>
                      <input
                        type="text"
                        value={value}
                        placeholder={`Enter your ${label.replace(/_/g, " ")}`}
                        onChange={(e: any) => handleChange(label, e.target.value)}
                        className="vd-input-field"
                      />
                    </div>
                  ))}
                </div>

                {/* FOOTER */}
                <div className="vd-modal-footer">
                  <div className="vd-verify-badge">
                    <ClipboardCheck size={12} />
                    <span>Verify before submission</span>
                  </div>
                  <div className="vd-footer-btns">
                    <button type="button" onClick={onClose} className="vd-btn-ghost">
                      Cancel
                    </button>
                    <button type="submit" className="vd-btn-save">
                      <Save size={14} />
                      Submit
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </WidgetPortal>
  );
}