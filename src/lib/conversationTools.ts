import { route } from "preact-router";

export const createConversationTools = (callbacks: {
  setActiveAvatar: (name: string) => void;
  setDataCollectionOpen: (open: boolean) => void;
  setUserData: (data: any) => void;
}) => {
  return {
    glowAvatar: async ({ name }: { name: string }) => {
      callbacks.setActiveAvatar(name);
      return `Switched active avatar to ${name}`;
    },

    scrollToSection: async ({ id }: { id: string }) => {
      console.log(`Navigating to: ${id}`);

      // WordPress plugin provides its own navigation handler
      // that prevents full-page reloads and handles cross-page nav
      if (typeof (window as any).VoiceDotsNavigate === 'function') {
        (window as any).VoiceDotsNavigate(id);
        return `Navigated to ${id}`;
      }

      // Default behavior for non-WordPress sites
      const section = document.getElementById(id);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      } else if (id.toLowerCase() === "home") {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return `Navigated to ${id}`;
    },

    navigateToSection: async ({ id }: { id: string }) => {
      console.log(`Navigating to section: ${id}`);
      if (typeof (window as any).VoiceDotsNavigate === "function") {
        (window as any).VoiceDotsNavigate(id);
        return `Navigated to ${id}`;
      }

      route(id);

      return `Navigated to ${id}`;
    },

    externalPageNavigation: async ({ id }: { id: string }) => {
      console.log(`Navigating to external page: ${id}`);
      window.location.href = id;

      return `Navigated to ${id}`;
    },

    openValidationPopup: async (data: {
      name?: string;
      email?: string;
      phone?: string;
      description?: string;
    }) => {
      callbacks.setUserData({
        name: data.name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        description: data.description ?? "",
      });
      callbacks.setDataCollectionOpen(true);
      return "Data collection modal opened for the user.";
    },
  };
};