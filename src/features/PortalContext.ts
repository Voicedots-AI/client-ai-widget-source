import { createContext } from "preact";
import { useContext } from "preact/hooks";

export const PortalContext = createContext<HTMLElement | null>(null);
export const usePortal = () => useContext(PortalContext);