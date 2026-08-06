import { useCallback, useRef, useState } from "preact/compat";
import { Room, RoomEvent, Participant, VideoPresets, RemoteParticipant, RemoteTrack } from "livekit-client";

// type Avatar = {
//     name: string;
//     role?: string;
//     image?: string;
// };

export function useVoicedotsConversationController() {
    const [micMuted, setMicMuted] = useState(false);
    const [room, setRoom] = useState<Room | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const startingRef = useRef(false);

    const [activeAvatar, setActiveAvatar] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [loginOpen, setLoginOpen] = useState(false);

    // DATA COLLECTION STATE
    const [dataCollectionOpen, setDataCollectionOpen] = useState(false);
    const [userData, setUserData] = useState<any>(null);
    const [dataConfirmed, setDataConfirmed] = useState(false);
    // When the agent opens the popup with missing fields (lead-gen flow), the
    // form is editable and the user types + submits. When all fields arrive
    // pre-filled (voice-collected verification flow), it is read-only.
    const [leadFormEditable, setLeadFormEditable] = useState(false);
    const roomRef = useRef<Room | null>(null);

    const publishToAgent = async (obj: Record<string, unknown>) => {
        const r = roomRef.current;
        if (!r || !r.localParticipant) return;
        try {
            const payload = new TextEncoder().encode(JSON.stringify(obj));
            await r.localParticipant.publishData(payload, { reliable: true });
        } catch (e) {
            console.error("Failed to publish data to agent", e);
        }
    };

    // Tracks the current agent so the lead-captured guard is per-client.
    const agentIdRef = useRef<string>("");
    // Session-level guard: once the lead is captured (or the caller dismisses the
    // form), the popup must not re-appear — this stopped an endless popup loop that
    // also masked the End Call button.
    const leadCapturedRef = useRef(false);

    const leadStorageKey = () => `vd_lead_captured_${agentIdRef.current || "default"}`;
    const isLeadAlreadyCaptured = () => {
        if (leadCapturedRef.current) return true;
        try { return localStorage.getItem(leadStorageKey()) === "1"; } catch { return false; }
    };
    const markLeadCaptured = () => {
        leadCapturedRef.current = true;
        try { localStorage.setItem(leadStorageKey(), "1"); } catch { /* ignore */ }
    };

    // Editable-form submit: send the typed lead to the agent and close for good.
    const handleUserDataCollected = async (data: any) => {
        setUserData(data);
        setDataCollectionOpen(false);
        markLeadCaptured();
        await publishToAgent({ type: "USER_DATA", data });
        await publishToAgent({ type: "POPUP_STATE", open: false });
    };

    // Manual close (X / cancel) — let the agent's silence watchdog resume.
    const handleLeadFormClose = async () => {
        setDataCollectionOpen(false);
        await publishToAgent({ type: "POPUP_STATE", open: false });
    };

    // const [tableState, setTableState] = useState({
    //     isOpen: false,
    //     isLoading: false,
    //     data: [] as Record<string, unknown>[],
    //     title: "Data"
    // });

    // const closeTable = () => setTableState(prev => ({ ...prev, isOpen: false }));
    const toggleMic = async () => {
        if (!room || !room.localParticipant) return;
        const isMuted = !micMuted;
        setMicMuted(isMuted);

        try {
            await room.localParticipant.setMicrophoneEnabled(!isMuted);
        } catch (e) {
            console.error("Failed to toggle mic", e);
        }
    };

    const start = useCallback(async (agentId: string) => {
        if (startingRef.current) return;
        if (isConnected || isConnecting) return;

        agentIdRef.current = agentId;
        startingRef.current = true;
        setIsConnecting(true);
        setError(null);

        try {
            // 1. Fetch token from our new remote token server
            const response = await fetch(`https://token.voicedots.io/getToken?agent_id=${agentId}`);
            
            if (response.status === 429) {
                // Server is at capacity — show user-friendly message
                const errorData = await response.json();
                setError(errorData.message || "We're experiencing high call volume right now. Please try again in a few minutes.");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch token");
            }

            const { token, ws_url } = await response.json();

            // 2. Connect to LiveKit Room
            const newRoom = new Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: VideoPresets.h720.resolution,
                },
            });

            // Handle Agent Speaking State (Rough approximation based on audio tracks/events)
            newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
                // If any remote participant is speaking, we assume the agent is speaking
                const remoteSpeaker = speakers.find((p) => p instanceof RemoteParticipant);
                setIsSpeaking(!!remoteSpeaker);
            });

            // Handle Audio Track Subscription for Playback
            newRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
                if (track.kind === "audio") {
                    const audioElement = track.attach();
                    // Attach the created audio element to the DOM so it can play
                    document.body.appendChild(audioElement);
                }
            });

            newRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                const attachedElements = track.detach();
                attachedElements.forEach(el => el.remove());
            });

            // Data channel for custom tool calls from Agent -> Frontend
            newRoom.on(RoomEvent.DataReceived, async (payload: Uint8Array) => {
                try {
                    const msg = JSON.parse(new TextDecoder().decode(payload));
                    console.log("Received data from agent:", msg);

                    if (msg.type === "TOOL_CALL") {
                        if (msg.function === "openValidationPopup") {
                            // Guard: never re-show the popup once the lead is captured or
                            // the caller already dealt with it this session. Prevents the
                            // endless-popup loop and keeps End Call reachable.
                            if (isLeadAlreadyCaptured()) {
                                await publishToAgent({ type: "USER_DATA", data: { ...userData, _suppressed: true } });
                                await publishToAgent({ type: "POPUP_STATE", open: false });
                                return;
                            }
                            const lead = {
                                name: msg.args?.name ?? "",
                                email: msg.args?.email ?? "",
                                phone: msg.args?.phone ?? "",
                            };
                            setDataConfirmed(false);
                            setUserData(lead);
                            // Missing fields => lead-gen flow: editable form the user
                            // types into. All pre-filled => voice-collected verification.
                            setLeadFormEditable(!(lead.name && lead.email && lead.phone));
                            setDataCollectionOpen(true);
                            // Hold the agent's silence watchdog while the user types.
                            await publishToAgent({ type: "POPUP_STATE", open: true });
                        } else if (msg.function === "updateField") {
                            // Real-time single field update from agent
                            const fieldName = msg.args?.field;
                            const fieldValue = msg.args?.value;
                            if (fieldName && fieldValue !== undefined) {
                                console.log(`[Tool] Updating field: ${fieldName} = ${fieldValue}`);
                                setUserData((prev: any) => ({
                                    ...prev,
                                    [fieldName]: fieldValue,
                                }));
                            }
                        } else if (msg.function === "confirmSave") {
                            // Agent confirmed data accuracy — auto-save
                            console.log("[Tool] Data confirmed by agent — auto-saving");
                            setDataConfirmed(true);
                            // Close modal after brief delay to show confirmation
                            setTimeout(() => {
                                setDataCollectionOpen(false);
                                setDataConfirmed(false);
                                publishToAgent({ type: "POPUP_STATE", open: false });
                            }, 2000);
                        } else if (msg.function === "glowAvatar") {
                            const avatarName = msg.args?.name?.toString() ?? "";
                            console.log(`Setting active avatar to: ${avatarName}`);
                            setActiveAvatar(avatarName);
                        } else if (msg.function === "endCall") {
                            console.log("[Tool] Agent initiated end call");
                            if (newRoom) {
                                await newRoom.disconnect();
                            }
                            setRoom(null);
                            roomRef.current = null;
                            setIsConnected(false);
                            setIsSpeaking(false);
                            setActiveAvatar(null);
                            startingRef.current = false;
                        } else if (msg.function === "appointmentBooked") {
                            console.log("[Tool] Appointment booked:", msg.args);
                        }
                        else if (msg.function === "externalPageNavigation") {
                            console.log(`[Tool] Navigating user to external page: ${msg.args?.url}`);
                            if(msg.args.id) {
                                window.location.href = msg.args.id;
                            }
                            else{
                                console.warn(`No URL provided for externalPageNavigation: ${JSON.stringify(msg.args)}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error parsing data message", e);
                }
            });

            // Set LiveKit Cloud WebSocket URL from backend, with local fallback just in case
            const livekitUrl = ws_url

            await newRoom.connect(livekitUrl, token);

            // Publish Microphone
            await newRoom.localParticipant.setMicrophoneEnabled(true);
            setMicMuted(false);

            setRoom(newRoom);
            roomRef.current = newRoom;
            setIsConnected(true);

        } catch (err: any) {
            console.error("LiveKit connection error:", err);
            setError(err.message || "Failed to start conversation");
        } finally {
            startingRef.current = false;
            setIsConnecting(false);
        }
    }, [isConnected, isConnecting]);

    const stop = async () => {
        startingRef.current = false;

        if (room) {
            await room.disconnect();
            setRoom(null);
            roomRef.current = null;
        }

        setIsConnected(false);
        setIsSpeaking(false);
        setActiveAvatar(null);
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
        // tableState,
        // closeTable,
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
    };
}
