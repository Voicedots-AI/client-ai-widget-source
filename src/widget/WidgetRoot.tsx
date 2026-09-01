import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import AITeamWidget from './AITeamWidget';
// import '../styles/widget.css';
import { PortalContext } from '../features/PortalContext';
// import { SoftNavigation } from '../lib/navigation';
import widgetStyles from '../styles/widget.css?inline';

// Anything a client's page still needs to control is read from their snippet.
// `forceEmbed` in clients/<name>.json wins over it, because several tenants
// pasted their snippet into a CMS or GTM tag we cannot edit any more — their
// bundle is then the only place a setting can still be changed.
const forcedConfig: Record<string, unknown> =
  typeof __VD_FORCED_CONFIG__ === 'object' && __VD_FORCED_CONFIG__ !== null
    ? __VD_FORCED_CONFIG__
    : {};

// Phones and small tablets. Matches the breakpoint the widget CSS already uses
// for its own layout, so "mobile" means one thing across the widget.
const MOBILE_QUERY = '(max-width: 768px)';

function isMobileViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_QUERY).matches;
}

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
      return { ...JSON.parse(config), ...forcedConfig };
    } catch (e) {
      console.error("VoiceDots: JSON Parse Error", e);
      return { avatars: [], ...forcedConfig };
    }
  }, [config]);

  const themeColor = parsedConfig.themeColor || '#8B5CF6';
  const widgetWidth = parsedConfig.widgetWidth || "300px";

  // How the widget starts. `minimized` is the desktop answer; `mobileMinimized`
  // overrides it on a phone, where an open card covers most of the page. The
  // viewport is read once, at mount, so a later resize never yanks the card
  // away from someone using it.
  const initiallyMinimized = useMemo(() => {
    if (isMobileViewport() && parsedConfig.mobileMinimized !== undefined) {
      return Boolean(parsedConfig.mobileMinimized);
    }
    return Boolean(parsedConfig.minimized);
  }, [parsedConfig]);

  // Seconds the card stays open before folding itself away, for clients who
  // want the widget noticed but not left sitting on top of their page. 0 or
  // absent means it stays open until the visitor closes it.
  const autoCloseSeconds = Number(parsedConfig.autoCloseSeconds) || 0;

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
          autoCloseSeconds={autoCloseSeconds}
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
