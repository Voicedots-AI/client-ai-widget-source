import { Mic, MicOff, Square, LucideMinimize2 } from "lucide-preact";
import { useRef, useEffect, useState } from "preact/hooks";
import AnimationController from "../features/AnimationController";
import type { AvatarHandle } from "../features/AnimationController";
import { useVoicedotsConversationController } from "../features/voicedotsConversationController";
import { useGeminiConversationController } from "../features/geminiConversationController";
import DataCollectionModal from "../modals/DataCollectionModal";
import VoicedotsDataCollectionModal from "../modals/VoicedotsDataCollectionModal";
import StudentRecordModal from "../modals/StudentRecordModal";
import type { Avatar } from "../features/types";


export default function AITeamWidget({ title, brandName, agentId, avatars, logo, pos, mini, msg, pipeline, wsUrl }: { title: string, brandName?: string, agentId: string, avatars: Avatar[], logo: string, pos: string, mini: boolean, msg: string, pipeline?: string, wsUrl?: string }) {
  // The collapsed pill shows the client's own name; falls back to ours.
  const pillName = brandName || "VoiceDots";
  const [minimized, setMinimized] = useState(mini);
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

  // Start/Stop Logic
  const startConversation = () => {
    if (avatars.length > 0) {
      const firstAgent = avatars[0];
      conversation.setActiveAvatar(firstAgent.name.toLocaleLowerCase().replace(" ", "_"));
      conversation.start(agentId, avatars);
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

  return (
    <div className={`vd-widget-container vd-pos-${pos}`}>
      {/* ================= MODALS ================= */}
      {tag === "voicedots" && !conversation.leadFormEditable && (
        <VoicedotsDataCollectionModal
          isOpen={conversation.dataCollectionOpen}
          title="Verify Information"
          onClose={conversation.handleLeadFormClose}
          data={conversation.userData}
          confirmed={conversation.dataConfirmed}
        />
      )}

      {/* Lead-gen flow: agent opened the popup with missing fields — the user
          types their details and submits (avoids STT errors on emails/numbers). */}
      {tag === "voicedots" && conversation.leadFormEditable && (
        <DataCollectionModal
          isOpen={conversation.dataCollectionOpen}
          title="Your Details"
          onClose={conversation.handleLeadFormClose}
          data={conversation.userData}
          onSubmit={conversation.handleUserDataCollected}
        />
      )}

      {tag !== "voicedots" && (
        <DataCollectionModal
          isOpen={conversation.dataCollectionOpen}
          title="Verify Information"
          onClose={() => conversation.setDataCollectionOpen(false)}
          data={conversation.userData}
          onSubmit={conversation.handleUserDataCollected}
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

      {/* ================= MAIN WIDGET ================= */}
      {!minimized && (
        <div className="vd-main-card">
          <div className="vd-header">
            <div className="vd-title-group">
              <h3>{title}</h3>
              {conversation.isConnected && (
                <span className="vd-timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              )}
            </div>
            <button onClick={() => setMinimized(true)} className="vd-icon-btn">
              <LucideMinimize2 size={18} />
            </button>
          </div>

          <div className="vd-body">
            <div className={`vd-avatar-grid count-${avatars.length}`}>
              {avatars.map((avatar) => (
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
                      </>
                    )}
                  </button>
                  <a href="https://voicedots.io/" target="_blank" rel="noopener noreferrer" className="vd-watermark">
                    Powered by VoiceDots
                  </a>
                </>
              ) : (
                <>
                  <div className="vd-active-controls">
                    <button onClick={conversation.toggleMic} className="vd-mic-btn">
                      {conversation.micMuted ? <MicOff color="red" /> : <Mic />}
                    </button>
                    <button onClick={conversation.stop} className="vd-end-btn">
                      <Square size={16} fill="currentColor" /> End Call
                    </button>
                  </div>
                  <a href="https://voicedots.io/" target="_blank" rel="noopener noreferrer" className="vd-watermark">
                    Powered by VoiceDots
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MINIMIZED PILL ================= */}
      {minimized && (
        <div className="vd-pill-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
          
          {/* Temporary Message Prompt */}
          {!conversation.isConnected && msg.length > 0 && (
            <div className="vd-talk-prompt">
              {msg}
            </div>
          )}

          <button className="vd-pill" onClick={() => setMinimized(false)}>
            <div className={`vd-pill-icon-container ${conversation.isSpeaking ? 'pulse' : ''}`}>
              <div className="vd-pill-icon">
                <img src={logo} alt={`${pillName} logo`} className="vd-pill-logo" />
              </div>
            </div>
            <span className="vd-pill-text">{pillName}</span>
          </button>
        </div>
      )}
    </div>
  );
}
