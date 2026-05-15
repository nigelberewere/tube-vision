import React, { createContext, useContext, useState } from 'react';

interface VoiceOverState {
  script: string;
  voice: string;
  pitch: number;
  speed: number;
  volume: number;
  sourceLanguage: string;
  audioUrl: string | null;
}

interface VoiceOverContextType {
  voiceOverState: VoiceOverState;
  updateVoiceOverState: (updates: Partial<VoiceOverState>) => void;
}

const VoiceOverContext = createContext<VoiceOverContextType | undefined>(undefined);

const DEFAULT_SCRIPT_PLACEHOLDER = [
  '[Excited] Hook your audience in the first 3 seconds with one clear promise.',
  '[Pause 1s] Reveal the twist they do not expect.',
  '[Confident] End with one action they can try today.',
].join('\n');

const DEFAULT_VOICE = 'Algenib';

export function VoiceOverProvider({ children }: { children: React.ReactNode }) {
  const [voiceOverState, setVoiceOverState] = useState<VoiceOverState>({
    script: DEFAULT_SCRIPT_PLACEHOLDER,
    voice: DEFAULT_VOICE,
    pitch: 0,
    speed: 1.0,
    volume: 1.0,
    sourceLanguage: 'en',
    audioUrl: null,
  });

  const updateVoiceOverState = (updates: Partial<VoiceOverState>) => {
    setVoiceOverState((prev) => ({ ...prev, ...updates }));
  };

  return (
    <VoiceOverContext.Provider value={{ voiceOverState, updateVoiceOverState }}>
      {children}
    </VoiceOverContext.Provider>
  );
}

export function useVoiceOverState() {
  const context = useContext(VoiceOverContext);
  if (!context) {
    throw new Error('useVoiceOverState must be used within VoiceOverProvider');
  }
  return context;
}
