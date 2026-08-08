import { useCallback, useRef, useState } from "preact/compat";

/**
 * Gemini Live voice controller (multi-tenant).
 *
 * Same returned interface as useVoicedotsConversationController — only the
 * transport differs: a WebSocket to the Sarvam pipeline backend
 * (wss://voice.voicedots.io/ws?agent=<agentId>) instead of a LiveKit room.
 * Mic PCM streams up (16k int16), agent PCM streams back (24k int16), and the
 * backend speaks the SAME {type:"TOOL_CALL", function, args} protocol.
 *
 * All audio processing lives in AudioWorklets (audio thread): host pages jank
 * the main thread, and main-thread audio glitches whenever they do. The player
 * keeps a small ring buffer and re-primes after underruns; the mic worklet
 * downsamples to 16k.
 */

const DEFAULT_WS_URL = "wss://voice.voicedots.io/ws";
const MIC_SAMPLE_RATE = 16000;
const AGENT_SAMPLE_RATE = 24000;

const WORKLET_SRC = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = []; this.offset = 0; this.buffered = 0; this.primed = false;
    this.firstPrime = true;   // ~300ms first prime kills start-of-call stutter
    this.sourceRatio = ${AGENT_SAMPLE_RATE} / sampleRate;
    this.port.onmessage = (e) => {
      if (e.data === "clear") { this.queue = []; this.offset = 0; this.buffered = 0; this.primed = false; return; }
      const int16 = new Int16Array(e.data);
      const f = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
      this.queue.push(f); this.buffered += f.length;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!this.primed) {
      const need = this.firstPrime ? 7200 : 2880;       // ~300ms first, ~120ms after
      if (this.buffered - this.offset >= need) { this.primed = true; this.firstPrime = false; }
      else { out.fill(0); return true; }
    }
    let i = 0;
    while (i < out.length && this.queue.length) {
      const cur = this.queue[0];
      const at = Math.floor(this.offset), frac = this.offset - at;
      const a = cur[Math.min(at, cur.length - 1)];
      const b = at + 1 < cur.length ? cur[at + 1] : (this.queue[1]?.[0] ?? a);
      out[i++] = a + (b - a) * frac;
      this.offset += this.sourceRatio;
      while (this.queue.length && this.offset >= this.queue[0].length) {
        this.offset -= this.queue[0].length;
        this.buffered -= this.queue[0].length;
        this.queue.shift();
      }
    }
    if (i < out.length) {
      out.fill(0, i);
      if (!this.queue.length) { this.primed = false; this.port.postMessage("drained"); }
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);

class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.acc = []; this.accLen = 0;
    this.ratio = sampleRate / ${MIC_SAMPLE_RATE};
  }
  process(inputs) {
    const inp = inputs[0] && inputs[0][0];
    if (!inp) return true;
    this.acc.push(new Float32Array(inp)); this.accLen += inp.length;
    if (this.accLen >= 2048 * this.ratio) {
      const all = new Float32Array(this.accLen);
      let o = 0; for (const a of this.acc) { all.set(a, o); o += a.length; }
      this.acc = []; this.accLen = 0;
      const outLen = Math.floor(all.length / this.ratio);
      const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const from = Math.floor(i * this.ratio);
        const to = Math.min(Math.floor((i + 1) * this.ratio), all.length);
        let s = 0; for (let j = from; j < to; j++) s += all[j];
        const v = Math.max(-1, Math.min(1, s / Math.max(1, to - from)));
        out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}
registerProcessor("mic-capture", MicCapture);
`;
const workletUrl = () => URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));

type Avatar = { name: string; role?: string; image?: string };

export function useGeminiConversationController(wsBaseUrl?: string) {
    const [micMuted, setMicMuted] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const startingRef = useRef(false);
    const [activeAvatar, setActiveAvatar] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [studentFlow, setStudentFlow] = useState<any>({ open: false, intent: "fee", period: "today" });

    // DATA COLLECTION STATE (same semantics as the LiveKit controller)
    const [dataCollectionOpen, setDataCollectionOpen] = useState(false);
    const [userData, setUserData] = useState<any>(null);
    const [dataConfirmed, setDataConfirmed] = useState(false);
    const [leadFormEditable, setLeadFormEditable] = useState(false);

    const avatarsRef = useRef<Avatar[]>([]);
    const agentIdRef = useRef<string>("");

    // transport refs
    const wsRef = useRef<WebSocket | null>(null);
    const micCtxRef = useRef<AudioContext | null>(null);
    const playCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const playerNodeRef = useRef<AudioWorkletNode | null>(null);
    const micNodeRef = useRef<AudioWorkletNode | null>(null);
    const playDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const micMutedRef = useRef(false);

    const sendJSON = (obj: Record<string, unknown>) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    };

    // Session-level lead guard (mirrors the LiveKit controller): once captured
    // or dismissed, the popup must not re-appear this session.
    const leadCapturedRef = useRef(false);
    const isLeadAlreadyCaptured = () => {
        return leadCapturedRef.current;
    };
    const markLeadCaptured = () => {
        leadCapturedRef.current = true;
    };

    const handleUserDataCollected = async (data: any) => {
        setUserData(data);
        setDataCollectionOpen(false);
        markLeadCaptured();

        // Save lead data in browser localStorage for direct client inspection
        try {
            const leadRecord = {
                ...data,
                agentId: agentIdRef.current || "voicedots_agent",
                timestamp: new Date().toISOString(),
                url: typeof window !== "undefined" ? window.location.href : ""
            };
            const existingStr = localStorage.getItem("voicedots_captured_leads");
            const existing = existingStr ? JSON.parse(existingStr) : [];
            existing.push(leadRecord);
            localStorage.setItem("voicedots_captured_leads", JSON.stringify(existing));

            // Log to console for quick developer feedback
            console.log("📌 [VoiceDots] Lead Captured & Saved:", leadRecord);

            // Dispatch event for host website JavaScript listeners
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("voicedots_lead", { detail: leadRecord }));
                if (typeof (window as any).VoiceDotsOnLeadCaptured === "function") {
                    (window as any).VoiceDotsOnLeadCaptured(leadRecord);
                }
            }
        } catch (e) {
            console.warn("[VoiceDots] localStorage save error:", e);
        }

        sendJSON({ type: "USER_DATA", data });
        sendJSON({ type: "POPUP_STATE", open: false });
    };

    const handleLeadFormClose = async () => {
        setDataCollectionOpen(false);
        // Dismissal suppresses repeats for this call only. Do not persist it
        // across future visits and do not manufacture an empty USER_DATA event.
        leadCapturedRef.current = true;
        sendJSON({ type: "POPUP_STATE", open: false });
        sendJSON({ type: "LEAD_DECLINED" });
    };

    const toggleMic = async () => {
        const next = !micMutedRef.current;
        micMutedRef.current = next;
        setMicMuted(next);
        streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    };

    const playAudioChunk = (buf: ArrayBuffer) => {
        const ctx = playCtxRef.current;
        if (ctx?.state === "suspended") ctx.resume().catch(() => {});
        playerNodeRef.current?.port.postMessage(buf, [buf]);
    };

    // Barge-in / stop: flush the player worklet's queue.
    const stopPlayback = () => {
        playerNodeRef.current?.port.postMessage("clear");
    };

    const cleanup = () => {
        stopPlayback();
        wsRef.current?.close(); wsRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
        micCtxRef.current?.close().catch(() => {}); micCtxRef.current = null;
        playCtxRef.current?.close().catch(() => {}); playCtxRef.current = null;
        audioElRef.current?.pause(); audioElRef.current = null;
        playDestRef.current = null;
        playerNodeRef.current = null; micNodeRef.current = null;
        startingRef.current = false;
        setIsConnected(false); setIsSpeaking(false); setIsConnecting(false);
        setActiveAvatar(null);
    };

    // Section navigation on the HOST site: /section path (SPA-unaware but works
    // for the common static/MPA case); "home" scrolls to top of /.
    const navigation = (id: string) => {
        if (!id) return;
        if (typeof (window as any).VoiceDotsNavigate === "function") {
            (window as any).VoiceDotsNavigate(id);
            return;
        }
        const local = document.getElementById(id);
        if (local) {
            local.scrollIntoView({ behavior: "smooth" });
            return;
        }
        if (id.toLowerCase() === "home") {
            if (window.location.pathname !== "/") window.location.href = "/";
            else window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            window.location.href = `/${id}`;
        }
    };

    const handleToolCall = async (msg: any) => {
        if (msg.function === "openValidationPopup") {
            if (isLeadAlreadyCaptured()) {
                sendJSON({ type: "POPUP_STATE", open: false });
                return;
            }
            const lead = {
                name: msg.args?.name ?? "", email: msg.args?.email ?? "", phone: msg.args?.phone ?? "",
            };
            setDataConfirmed(false);
            setUserData(lead);
            setLeadFormEditable(!(lead.name && lead.email && lead.phone));
            setDataCollectionOpen(true);
            sendJSON({ type: "POPUP_STATE", open: true });
        } else if (msg.function === "updateField") {
            const f = msg.args?.field, v = msg.args?.value;
            if (f && v !== undefined) setUserData((prev: any) => ({ ...prev, [f]: v }));
        } else if (msg.function === "confirmSave") {
            setDataConfirmed(true);
            markLeadCaptured();
            setUserData((prev: any) => { if (prev) sendJSON({ type: "USER_DATA", data: prev }); return prev; });
            setTimeout(() => {
                setDataCollectionOpen(false);
                setDataConfirmed(false);
                sendJSON({ type: "POPUP_STATE", open: false });
            }, 2000);
        } else if (msg.function === "navigateToSection") {
            const section = msg.args?.section_name || msg.args?.section || msg.args?.id || "";
            if (section) navigation(String(section));
        } else if (msg.function === "externalPageNavigation") {
            if (msg.args?.id) window.location.href = msg.args.id;
        } else if (msg.function === "glowAvatar" && msg.args?.name) {
            // Persona keys don't always match widget avatar names — resolve
            // against this widget's configured avatars.
            const raw = String(msg.args.name);
            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const hit = avatarsRef.current.find((a) =>
                norm(a.name) === norm(raw) || norm(a.name) === norm(raw.replace(/_/g, " ")));
            setActiveAvatar(hit ? hit.name.toLocaleLowerCase().replace(" ", "_") : raw);
        } else if (msg.function === "endCall") {
            // Let the queued goodbye finish before tearing down: the player
            // worklet posts "drained" when its buffer empties.
            const node = playerNodeRef.current;
            if (node) {
                let done = false;
                const finish = () => { if (!done) { done = true; cleanup(); } };
                node.port.addEventListener("message", (e: MessageEvent) => {
                    if (e.data === "drained") setTimeout(finish, 300);
                });
                node.port.start();
                setTimeout(finish, 10000);   // failsafe
            } else {
                cleanup();
            }
        } else if (msg.function === "appointmentBooked") {
            console.log("[Tool] Appointment booked:", msg.args);
        } else if (msg.function === "requestLogin") {
            const intent = ["marks", "attendance", "academic_review", "academic_contacts"].includes(msg.args?.intent)
                ? msg.args.intent : "fee";
            const period = ["today", "week", "month", "semester"].includes(msg.args?.period)
                ? msg.args.period : "today";
            setStudentFlow({ open: true, intent, period });
            sendJSON({ type: "POPUP_STATE", open: true });
        }
    };

    const start = useCallback(async (agentId: string, avatars: Avatar[] = []) => {
        if (startingRef.current) return;
        if (isConnected || isConnecting) return;
        startingRef.current = true;
        agentIdRef.current = agentId;
        avatarsRef.current = avatars;
        leadCapturedRef.current = false;
        setIsConnecting(true);
        setError(null);

        try {
            // Audio contexts MUST be created (and resumed) inside the click
            // gesture — creating them later in ws.onopen leaves them suspended
            // under the browser autoplay policy and the agent plays silently.
            // Use the device-native context rate. PcmPlayer explicitly resamples
            // the 24 kHz agent stream; forcing 24 kHz is ignored by some browsers
            // and caused the opening audio to play fast/high-pitched.
            const playCtx = new AudioContext();
            playCtxRef.current = playCtx;
            await playCtx.resume().catch(() => {});
            const url = workletUrl();
            await playCtx.audioWorklet.addModule(url);
            const playerNode = new AudioWorkletNode(playCtx, "pcm-player");
            playerNodeRef.current = playerNode;

            // Route agent audio via an <audio> element so the browser's echo
            // canceller subtracts it from the mic.
            const playDest = playCtx.createMediaStreamDestination();
            playDestRef.current = playDest;
            playerNode.connect(playDest);
            const audioEl = new Audio();
            audioEl.srcObject = playDest.stream;
            audioEl.play().catch((e) => console.warn("audio playback blocked:", e));
            audioElRef.current = audioEl;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
            });
            streamRef.current = stream;

            // Mic context at the browser's native rate; the worklet downsamples.
            const micCtx = new AudioContext();
            micCtxRef.current = micCtx;
            await micCtx.resume().catch(() => {});
            await micCtx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);

            const base = wsBaseUrl || DEFAULT_WS_URL;
            const ws = new WebSocket(`${base}${base.includes("?") ? "&" : "?"}agent=${encodeURIComponent(agentId)}`);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                const source = micCtx.createMediaStreamSource(stream);
                const micNode = new AudioWorkletNode(micCtx, "mic-capture");
                micNodeRef.current = micNode;
                micNode.port.onmessage = (e) => {
                    if (ws.readyState !== WebSocket.OPEN || micMutedRef.current) return;
                    ws.send(e.data);
                };
                source.connect(micNode);
                micNode.connect(micCtx.destination);   // keeps the node running (outputs silence)

                setIsConnected(true);
                setIsConnecting(false);
                startingRef.current = false;
            };

            ws.onmessage = async (event) => {
                if (event.data instanceof ArrayBuffer) { playAudioChunk(event.data); return; }
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "TOOL_CALL") {
                        await handleToolCall(msg);
                    } else if (msg.type === "UserStartedSpeaking" ||
                               msg.type === "FlushAgentAudio" ||
                               msg.type === "PersonaSwitchStarted") {
                        stopPlayback();   // barge-in: silence queued agent audio
                        setIsSpeaking(false);
                    } else if (msg.type === "Latency") {
                        setIsSpeaking(true);
                    } else if (msg.type === "AgentAudioDone") {
                        setIsSpeaking(false);
                    } else if (msg.type === "Error") {
                        console.error("Agent error:", msg);
                        setError(msg.description || "Agent error");
                    } else if (msg.type === "LeadValidationError") {
                        setError(msg.description || "Please check your contact details");
                        setDataCollectionOpen(true);
                    }
                } catch (e) {
                    console.error("Error parsing agent message", e);
                }
            };

            ws.onclose = () => cleanup();
            ws.onerror = () => { setError("Connection failed"); cleanup(); };
        } catch (err: any) {
            console.error("Sarvam connection error:", err);
            setError(err?.message || "Failed to start conversation");
            cleanup();
        }
    }, [isConnected, isConnecting]);

    const stop = async () => {
        sendJSON({ type: "stop" });
        cleanup();
    };

    return {
        start,
        stop,
        isConnected,
        isConnecting,
        isSpeaking,
        activeAvatar,
        setActiveAvatar,
        toggleMic,
        micMuted,
        error,
        setError,
        loginOpen,
        setLoginOpen,
        dataCollectionOpen,
        setDataCollectionOpen,
        handleUserDataCollected,
        handleLeadFormClose,
        leadFormEditable,
        userData,
        setUserData,
        dataConfirmed,
        studentFlow,
        closeStudentFlow: () => {
            setStudentFlow((prev: any) => ({ ...prev, open: false }));
            sendJSON({ type: "POPUP_STATE", open: false });
            sendJSON({ type: "LOGIN_RESULT", status: "cancelled", intent: studentFlow.intent });
        },
        studentLoginSuccess: () => sendJSON({ type: "LOGIN_RESULT", status: "success", intent: studentFlow.intent }),
        studentResult: (status: string, identifier: string) => sendJSON({
            type: "FEE_RESULT", status, intent: studentFlow.intent, rollNo: identifier,
        }),
    };
}
