import { createPortal } from "preact/compat";
import { usePortal } from "../features/PortalContext";

export const WidgetPortal = ({ children }: { children: any }) => {
  const container = usePortal();

  if (!container) return null;

  return createPortal(children, container);
};