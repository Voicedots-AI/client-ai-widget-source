import { Mic, MicOff, Square, LucideMinimize2, Sparkles, X, Zap } from "lucide-preact";
import { useRef, useEffect, useState } from "preact/hooks";
import AnimationController from "../features/AnimationController";
import type { AvatarHandle } from "../features/AnimationController";
import { useVoicedotsConversationController } from "../features/voicedotsConversationController";
import { useGeminiConversationController } from "../features/geminiConversationController";
import DataCollectionModal from "../modals/DataCollectionModal";
import VoicedotsDataCollectionModal from "../modals/VoicedotsDataCollectionModal";
import StudentRecordModal from "../modals/StudentRecordModal";
import type { Avatar } from "../features/types";
import { AudioChime } from "../lib/AudioChime";

const DEFAULT_SONA_AVATARS: Avatar[] = [
  { name: "about", role: "About Us", avatar: "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/sales.lottie" },
  { name: "courses", role: "Courses", avatar: "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/support.lottie" },
  { name: "admission", role: "Admissions", avatar: "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/ceo.lottie" },
  { name: "placement", role: "Placements", avatar: "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/loan.lottie" }
];

export default function AITeamWidget({ title, brandName, agentId, avatars, logo, pos, mini, msg, pipeline, wsUrl }: { title: string, brandName?: string, agentId: string, avatars: Avatar[], logo: string, pos: string, mini: boolean, msg: string, pipeline?: string, wsUrl?: string }) {
  const effectiveAvatars = avatars && avatars.length > 0 ? avatars : DEFAULT_SONA_AVATARS;
  const effectiveTitle = title || "Sona AI";

  // The collapsed pill shows the client's own name; falls back to ours.
  const pillName = brandName || "VoiceDots";
  const [minimized, setMinimized] = useState(mini);
  const [showToaster, setShowToaster] = useState(true);
  const [hasPoppedSound, setHasPoppedSound] = useState(false);

  let tag = "default";
  let conversation;
  // "websocket" and "sarvam" are legacy aliases kept so older embeds keep working;
  // all of them run the Gemini Live pipeline.
  if (pipeline === "gemini" || pipeline === "websocket" || pipeline === "sarvam") {
    conversation = useGeminiConversationController(wsUrl);
    tag = "voicedots";
  } else {
    // LiveKit path, for clients not yet on the WebSocket pipeline.
    conversation = useVoicedotsConversationController();
    tag = "voicedots";
  }
  const studentConversation = conversation as any;

  const avatarRefs = useRef<Record<string, AvatarHandle | null>>({});
  const [timeLeft, setTimeLeft] = useState(360);

  // Auto notification popup chime on visit
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasPoppedSound && minimized) {
        AudioChime.playPopSound();
        setHasPoppedSound(true);
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [minimized, hasPoppedSound]);

  // Handle open widget with sound
  const handleOpenWidget = () => {
    AudioChime.playPopSound();
    setMinimized(false);
  };

  // Handle minimize widget with sound
  const handleMinimizeWidget = () => {
    AudioChime.playClickSound();
    setMinimized(true);
    setShowToaster(true);
  };

  // Start/Stop Logic
  const startConversation = () => {
    AudioChime.playSuccessSound();
    if (effectiveAvatars.length > 0) {
      const firstAgent = effectiveAvatars[0];
      conversation.setActiveAvatar(firstAgent.name.toLocaleLowerCase().replace(" ", "_"));
      conversation.start(agentId, effectiveAvatars);
    }
  };

  // Sync Animations with Conversation State
  useEffect(() => {
    const activeName = conversation.activeAvatar;
    if (!activeName) return;

    if (conversation.isSpeaking) {
      avatarRefs.current[activeName]?.startTalking();
    } else {
      avatarRefs.current[activeName]?.stopTalking();
    }
  }, [conversation.isSpeaking, conversation.activeAvatar]);

  // Timer Logic
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (conversation.isConnected) {
      setTimeLeft(360); // Reset to 6 mins on every new connection
      timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [conversation.isConnected]);

  useEffect(() => {
    if (conversation.isConnected && timeLeft === 0) {
      conversation.stop();
    }
  }, [timeLeft, conversation.isConnected]);

  const defaultPrompt = msg && msg.length > 0 ? msg : "👋 Let your website talk – Literally!";

  return (
    <div className={`vd-widget-container vd-pos-${pos}`}>
      {/* ================= MODALS ================= */}
      {/* 1. Voice STT confirmation modal (read-only live speech verification during call) */}
      {tag === "voicedots" && !conversation.leadFormEditable && conversation.dataCollectionOpen && (
        <VoicedotsDataCollectionModal
          isOpen={conversation.dataCollectionOpen}
          title="Verify Information"
          onClose={conversation.handleLeadFormClose}
          data={conversation.userData}
          confirmed={conversation.dataConfirmed}
        />
      )}

      {/* 2. Voice-triggered data form (when voice AI requests user inputs) */}
      {conversation.leadFormEditable && conversation.dataCollectionOpen && (
        <DataCollectionModal
          isOpen={conversation.dataCollectionOpen}
          title="Leave Contact Details"
          onClose={conversation.handleLeadFormClose}
          data={conversation.userData && Object.keys(conversation.userData).length > 0 ? conversation.userData : { Name: "", Email: "", Phone: "", Inquiry: "" }}
          onSubmit={(data) => {
            AudioChime.playSuccessSound();
            conversation.handleUserDataCollected(data);
          }}
        />
      )}

      {tag === "voicedots" && studentConversation.studentFlow && (
        <StudentRecordModal
          flow={studentConversation.studentFlow}
          onClose={studentConversation.closeStudentFlow}
          onLogin={studentConversation.studentLoginSuccess}
          onResult={studentConversation.studentResult}
        />
      )}

      {/* ================= MAIN WIDGET CARD ================= */}
      {!minimized && (
        <div className="vd-main-card vd-animate-pop-in">
          <div className="vd-header">
            <div className="vd-title-group">
              <div className="vd-brand-badge">
                <span className="vd-status-dot"></span>
                <div className="vd-equalizer-bars">
                  <span></span><span></span><span></span>
                </div>
                <h3>{effectiveTitle}</h3>
              </div>
              {conversation.isConnected && (
                <span className="vd-timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              )}
            </div>
            
            <div className="vd-header-actions">
              <button onClick={handleMinimizeWidget} className="vd-icon-btn" title="Minimize">
                <LucideMinimize2 size={16} />
              </button>
            </div>
          </div>

          <div className="vd-body">
            <div className={`vd-avatar-grid count-${effectiveAvatars.length}`}>
              {effectiveAvatars.map((avatar) => (
                <div 
                  key={avatar.name} 
                  className={`vd-avatar-item ${conversation.activeAvatar === avatar.name.toLowerCase().replace(" ", "_") ? 'active' : ''}`}
                  onMouseEnter={() => {
                     if (!conversation.isSpeaking || conversation.activeAvatar !== avatar.name.toLowerCase().replace(" ", "_")) {
                       avatarRefs.current[avatar.name.toLowerCase().replace(" ", "_")]?.triggerHover();
                     }
                  }}
                  onMouseLeave={() => {
                     if (!conversation.isSpeaking || conversation.activeAvatar !== avatar.name.toLowerCase().replace(" ", "_")) {
                       avatarRefs.current[avatar.name.toLowerCase().replace(" ", "_")]?.stopHover();
                     }
                  }}
                >
                   <AnimationController
                      lottieSrc={avatar.avatar}
                      ref={(el: AvatarHandle | null) => { avatarRefs.current[avatar.name.toLowerCase().replace(" ", "_")] = el; }}
                    />
                  <p>{avatar.role}</p>
                </div>
              ))}
            </div>

            <div className="vd-controls">
              {!conversation.isConnected ? (
                <>
                  <button className="vd-btn-primary" onClick={startConversation} disabled={conversation.isConnecting}>
                    {conversation.isConnecting ? (
                      <>
                        <div className="vd-btn-icon-wrapper vd-sliding">
                          <img src={logo} alt="VoiceDots Logo" />
                        </div>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <div className="vd-btn-icon-wrapper">
                          <img src={logo} alt="VoiceDots Logo" />
                        </div>
                        Let's Talk
                        <Sparkles size={16} style={{ marginLeft: '8px', opacity: 0.9 }} />
                      </>
                    )}
                  </button>
                  <a href="https://voicedots.io/" target="_blank" rel="noopener noreferrer" className="vd-watermark">
                    <span>Powered by</span> <strong>VoiceDots</strong>
                  </a>
                </>
              ) : (
                <>
                  <div className="vd-active-controls">
                    <button onClick={conversation.toggleMic} className={`vd-mic-btn ${conversation.micMuted ? 'muted' : 'active'}`}>
                      {conversation.micMuted ? <MicOff color="#EF4444" /> : <Mic color="#10B981" />}
                    </button>
                    <button onClick={conversation.stop} className="vd-end-btn">
                      <Square size={16} fill="currentColor" /> End Call
                    </button>
                  </div>
                  <a href="https://voicedots.io/" target="_blank" rel="noopener noreferrer" className="vd-watermark">
                    <span>Powered by</span> <strong>VoiceDots</strong>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MINIMIZED PILL & TOASTER ================= */}
      {minimized && (
        <div className="vd-pill-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
          
          {/* Floating Toaster Speech Bubble Prompt */}
          {!conversation.isConnected && showToaster && (
            <div className="vd-talk-prompt vd-animate-bounce-in" onClick={handleOpenWidget}>
              <div className="vd-prompt-header">
                <div className="vd-prompt-title">
                  <div className="vd-hero-waveform" title="Live Voice Simulation">
                    <span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span>
                  </div>
                </div>
                <button 
                  className="vd-prompt-close" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowToaster(false);
                  }}
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>

              <div className="vd-prompt-body">
                <p>{defaultPrompt}</p>
              </div>

              {/* Action Chip inside Toaster */}
              <div className="vd-prompt-chips">
                <span className="vd-chip" onClick={(e) => {
                  e.stopPropagation();
                  handleOpenWidget();
                }}>
                  <Zap size={11} /> Start Voice AI
                </span>
              </div>
            </div>
          )}

          <button className="vd-pill" onClick={handleOpenWidget}>
            <div className={`vd-pill-icon-container ${conversation.isSpeaking ? 'pulse' : ''}`}>
              <div className="vd-pill-icon">
                <img src={logo} alt={`${pillName} logo`} className="vd-pill-logo" />
              </div>
              <span className="vd-notification-badge"></span>
            </div>
            <span className="vd-pill-text">{pillName}</span>
          </button>
        </div>
      )}
    </div>
  );
}
