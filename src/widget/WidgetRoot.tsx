import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import AITeamWidget from './AITeamWidget';
// import '../styles/widget.css';
import { PortalContext } from '../features/PortalContext';
// import { SoftNavigation } from '../lib/navigation';
import widgetStyles from '../styles/widget.css?inline';

const SONA_AGENT_ID = 'voicedots_agent_sona_4h7k2m9q5v1x8z3t6w0b';

export default function WidgetRoot({ config }: { config: string }) {
  const portalRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (portalRef.current) {
      setPortalHost(portalRef.current);
    }

    // Initialize soft navigation to handle Astro-like MPA reloads
    // const nav = SoftNavigation.getInstance();
    // nav.init();

    // return () => nav.destroy();
  }, []);

  const parsedConfig = useMemo(() => {
    try {
      return JSON.parse(config);
    } catch (e) {
      console.error("VoiceDots: JSON Parse Error", e);
      return { avatars: [] };
    }
  }, [config]);

  const themeColor = parsedConfig.themeColor || '#8B5CF6';
  const widgetWidth = parsedConfig.widgetWidth || "300px";
  // Sona's production snippet is injected through GTM and predates the
  // `minimized` option. Its client-specific CDN bundle must therefore supply
  // the safe default until their GTM tag is updated. An explicit value always
  // wins, and every other tenant retains the existing expanded default.
  const initiallyMinimized = parsedConfig.minimized
    ?? parsedConfig.agentId === SONA_AGENT_ID;

  return (
    <PortalContext.Provider value={portalHost}>
      <style>{widgetStyles}</style>
      <div 
        className="voicedots-widget-host" 
        style={{ '--theme-color': themeColor, '--widget-width': widgetWidth } as any}
      >
        {/* Main Widget UI */}
        <AITeamWidget 
          title={parsedConfig.title} 
          brandName={parsedConfig.brandName}
          agentId={parsedConfig.agentId} 
          avatars={parsedConfig.avatars}
          logo={parsedConfig.logo}
          pos={parsedConfig.pos || 'right'} 
          mini={initiallyMinimized}
          msg={parsedConfig.pillMessage || ""}
          pipeline={parsedConfig.pipeline}
          wsUrl={parsedConfig.wsUrl}
        />

        {/* This is where all modals will be injected */}
        <div className="vd-portal-host" ref={portalRef} />
      </div>
    </PortalContext.Provider>
  );
}
