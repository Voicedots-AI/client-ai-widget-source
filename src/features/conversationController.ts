import { useConversation } from "@elevenlabs/react";
import { useCallback, useRef, useState } from "preact/compat";
import { createConversationTools } from "../lib/conversationTools";

export type Avatar = {
  name: string;
  role: string;
  avatar: string;
};

export function useConversationController() {
  const [micMuted, setMicMuted] = useState(false);
  const [activeAvatar, setActiveAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dataConfirmed = false;

  // Data Collection State
  const [dataCollectionOpen, setDataCollectionOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  const conversation = useConversation({
    micMuted,
    onConnect: () => console.log("Voicedots Connected"),
    onDisconnect: () => {
      console.log("Voicedots Disconnected");
      setActiveAvatar(null);
    },
    onError: (err: any) => setError(err.message || "Conversation error"),
  });

  const isSpeaking = conversation.isSpeaking;
  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";

  const micRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);

  // Handle data submission from our Portal Modal
  const handleUserDataCollected = async (data: any) => {
    setUserData(data);
    setDataCollectionOpen(false);

    // Feed the data back to the AI so it knows the user filled the form
    await conversation.sendUserMessage(
      `The user has provided their info: ${JSON.stringify(data)}`
    );
  };

  const toggleMic = () => setMicMuted(v => !v);

  const requestMic = async () => {
    if (micRef.current) return true;
    try {
      micRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      setError("Microphone permission denied");
      return false;
    }
  };

  const getGreetingMessage = () => {
    const hour = new Date().getHours()

    if (hour < 12) {
      return "Good Morning"
    } else if (hour < 18) {
      return "Good Afternoon"
    } else {
      return "Good Evening"
    }
  }

  const start = useCallback(async (agentId: string, avatars: Avatar[]) => {
    if (startingRef.current || isConnected || isConnecting) return;

    startingRef.current = true;
    
    const avatarMap = avatars.reduce((acc, curr, i) => ({
      ...acc,
      [`avatar_${i + 1}`]: curr.name
    }), {});

    const greeting = {
      greet: getGreetingMessage()
    };

    try {
      if (!(await requestMic())) return;

      setMicMuted(false);

      await conversation.startSession({
        agentId,
        connectionType: "webrtc",
        dynamicVariables: {...avatarMap, ...greeting},
        clientTools: createConversationTools({
          setActiveAvatar,
          setDataCollectionOpen,
          setUserData
        })
      });
    } catch (err) {
      console.error(err);
      setError("Failed to start session");
    } finally {
      startingRef.current = false;
    }
  }, [conversation, isConnected, isConnecting]);

  const stop = async () => {
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null;
    setActiveAvatar(null);
    await conversation.endSession();
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
    dataCollectionOpen,
    setDataCollectionOpen,
    handleUserDataCollected,
    // Legacy path renders its own editable modal unconditionally; these exist
    // only to keep the controller shapes interchangeable in AITeamWidget.
    leadFormEditable: false,
    handleLeadFormClose: () => setDataCollectionOpen(false),
    userData,
    setUserData,
    dataConfirmed
  };
}