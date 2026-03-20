import { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import type { LucideIcon } from 'lucide-react';
import { 
  Send, 
  Bot, 
  User as UserIcon, 
  Loader2, 
  Sparkles, 
  Lightbulb, 
  Target, 
  MessageSquare,
  History,
  Plus,
  Trash2,
  BellRing,
  X,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import { useAuth } from '../lib/supabaseAuth';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AICoachProps {
  channelContext?: any;
  userProfile?: {
    id: string;
    name: string;
    picture: string;
  };
}

interface QuickPrompt {
  label: string;
  icon: LucideIcon;
  score: number;
}

interface ConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface InsightAlert {
  id: string;
  topic: string;
  liftPercent: number;
  signalType: 'retention' | 'retention-proxy';
  headline: string;
  summary: string;
  ideas: string[];
  generatedAt: string;
}

const JANSO_HISTORY_STORAGE_KEY = 'janso_chat_history_v1';
const JANSO_DISMISSED_ALERTS_STORAGE_KEY = 'janso_dismissed_alerts_v1';
const MAX_SAVED_CONVERSATIONS = 20;
const coachConversationCache = new Map<
  string,
  {
    conversations: ConversationRecord[];
    activeConversationId: string;
    messages: Message[];
  }
>();

function buildScopedStorageKey(baseKey: string, userId?: string): string {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
}

function readDismissedAlertIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(JANSO_DISMISSED_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === 'string' && value.trim()).slice(0, 40);
  } catch {
    return [];
  }
}

function persistDismissedAlertIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    JANSO_DISMISSED_ALERTS_STORAGE_KEY,
    JSON.stringify(ids.slice(0, 40)),
  );
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

function createWelcomeMessage(channelContext?: any): Message {
  return {
    role: 'model',
    text: `Hi! I'm Janso. ${channelContext ? `I've analyzed your channel "${channelContext.title}" and I'm ready to help you grow.` : 'Connect your channel for personalized advice, or just ask me anything about YouTube growth!'} How can I help you today?`,
  };
}

function createConversationId(): string {
  return `janso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildConversationTitle(messages: Message[], channelTitle?: string): string {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.text.trim());
  if (firstUserMessage) {
    const trimmed = firstUserMessage.text.trim();
    return trimmed.length > 64 ? `${trimmed.slice(0, 64)}...` : trimmed;
  }

  if (channelTitle && channelTitle.trim()) {
    return `${channelTitle.trim()} Strategy Chat`;
  }

  return 'New Janso Chat';
}

function createConversationRecord(messages: Message[], channelTitle?: string): ConversationRecord {
  const now = new Date().toISOString();
  return {
    id: createConversationId(),
    title: buildConversationTitle(messages, channelTitle),
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

function sortConversationsByLatest(conversations: ConversationRecord[]): ConversationRecord[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function getLatestConversationTimestamp(conversations: ConversationRecord[]): number {
  if (conversations.length === 0) return 0;
  const sorted = sortConversationsByLatest(conversations);
  return new Date(sorted[0].updatedAt).getTime() || 0;
}

function pickPreferredConversationSet(
  localConversations: ConversationRecord[],
  cloudConversations: ConversationRecord[],
): ConversationRecord[] {
  if (localConversations.length === 0) return cloudConversations;
  if (cloudConversations.length === 0) return localConversations;

  return getLatestConversationTimestamp(localConversations) >= getLatestConversationTimestamp(cloudConversations)
    ? localConversations
    : cloudConversations;
}

function hasUserMessages(messages: Message[]): boolean {
  return messages.some((message) => message.role === 'user' && message.text.trim().length > 0);
}

function hasMeaningfulConversations(conversations: ConversationRecord[]): boolean {
  return conversations.some((conversation) => hasUserMessages(conversation.messages));
}

function persistConversations(conversations: ConversationRecord[], storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(conversations.slice(0, MAX_SAVED_CONVERSATIONS)),
    );
  } catch (error) {
    console.error('Failed to persist AI Coach conversations:', error);
  }
}

function persistConversationsToKeys(conversations: ConversationRecord[], storageKeys: string[]): void {
  const uniqueKeys = [...new Set(storageKeys.filter((key) => typeof key === 'string' && key.trim()))];
  uniqueKeys.forEach((storageKey) => persistConversations(conversations, storageKey));
}

function parseStoredConversations(raw: string | null): ConversationRecord[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const sanitized = parsed
      .map((item): ConversationRecord | null => {
        if (!item || typeof item !== 'object') return null;

        const maybeMessages = (item as { messages?: unknown }).messages;
        if (!Array.isArray(maybeMessages)) return null;

        const messages = maybeMessages
          .map((message): Message | null => {
            if (!message || typeof message !== 'object') return null;

            const role = (message as { role?: unknown }).role;
            const text = (message as { text?: unknown }).text;

            if ((role !== 'user' && role !== 'model') || typeof text !== 'string') return null;

            const trimmedText = text.trim();
            if (!trimmedText) return null;

            return { role, text: trimmedText };
          })
          .filter((message): message is Message => Boolean(message));

        if (messages.length === 0) return null;

        const idValue = (item as { id?: unknown }).id;
        const titleValue = (item as { title?: unknown }).title;
        const createdAtValue = (item as { createdAt?: unknown }).createdAt;
        const updatedAtValue = (item as { updatedAt?: unknown }).updatedAt;

        const createdAt = typeof createdAtValue === 'string' ? createdAtValue : new Date().toISOString();
        const updatedAt = typeof updatedAtValue === 'string' ? updatedAtValue : createdAt;

        return {
          id: typeof idValue === 'string' && idValue ? idValue : createConversationId(),
          title: typeof titleValue === 'string' && titleValue.trim()
            ? titleValue.trim()
            : buildConversationTitle(messages),
          createdAt,
          updatedAt,
          messages,
        };
      })
      .filter((conversation): conversation is ConversationRecord => Boolean(conversation));

    return sortConversationsByLatest(sanitized).slice(0, MAX_SAVED_CONVERSATIONS);
  } catch {
    return [];
  }
}

function formatRelativeTime(timestamp: string): string {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 'Unknown';

  const diffMs = Date.now() - time;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function toGeminiHistory(messages: Message[]) {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      role: message.role,
      parts: [{ text: message.text }],
    }));
}

export default function AICoach({ channelContext, userProfile }: AICoachProps) {
  const { user: authUser, session: authSession } = useAuth();
  const [messages, setMessages] = useState<Message[]>([createWelcomeMessage(channelContext)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInsightAlert, setLoadingInsightAlert] = useState(false);
  const [insightAlert, setInsightAlert] = useState<InsightAlert | null>(null);
  const [lastAlertCheckAt, setLastAlertCheckAt] = useState<string | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(() => readDismissedAlertIds());
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [typingState, setTypingState] = useState<{ messageIndex: number; visibleCount: number; fullText: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const initializedHistoryKeyRef = useRef<string | null>(null);
  const hydratedHistoryKeyRef = useRef<string | null>(null);
  const supabaseSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConversationsRef = useRef<ConversationRecord[]>([]);
  const conversationsRef = useRef<ConversationRecord[]>([]);
  const activeConversationIdRef = useRef('');
  const messagesRef = useRef<Message[]>(messages);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const historyStorageUserIds = useMemo(
    () => [...new Set([authUser?.id, userProfile?.id].filter((value): value is string => Boolean(value && value.trim())))],
    [authUser?.id, userProfile?.id],
  );

  const historyStorageKeys = useMemo(() => {
    const scopedKeys = historyStorageUserIds.map((userId) => buildScopedStorageKey(JANSO_HISTORY_STORAGE_KEY, userId));
    return [...new Set([...scopedKeys, JANSO_HISTORY_STORAGE_KEY])];
  }, [historyStorageUserIds]);

  const primaryHistoryStorageKey = historyStorageKeys[0] || JANSO_HISTORY_STORAGE_KEY;
  const isHistoryHydrated = hydratedHistoryKeyRef.current === primaryHistoryStorageKey;
  const serverHistoryHeaders = useMemo(() => {
    const token = authSession?.access_token?.trim();
    if (!token) {
      return undefined;
    }

    return {
      Authorization: `Bearer ${token}`,
      'X-Supabase-Auth': token,
    };
  }, [authSession?.access_token]);
  const historyBootstrapKey = `${primaryHistoryStorageKey}:${serverHistoryHeaders ? 'server-auth' : 'server-anon'}`;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    conversationsRef.current = conversations;
    latestConversationsRef.current = conversations;
    if (!primaryHistoryStorageKey) return;
    coachConversationCache.set(primaryHistoryStorageKey, {
      conversations,
      activeConversationId: activeConversationIdRef.current,
      messages: messagesRef.current,
    });
  }, [conversations, primaryHistoryStorageKey]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    if (!primaryHistoryStorageKey) return;
    const cached = coachConversationCache.get(primaryHistoryStorageKey);
    if (cached) {
      coachConversationCache.set(primaryHistoryStorageKey, {
        ...cached,
        activeConversationId,
      });
    }
  }, [activeConversationId, primaryHistoryStorageKey]);

  useEffect(() => {
    messagesRef.current = messages;
    if (!primaryHistoryStorageKey) return;
    const cached = coachConversationCache.get(primaryHistoryStorageKey);
    if (cached) {
      coachConversationCache.set(primaryHistoryStorageKey, {
        ...cached,
        messages,
      });
    }
  }, [messages, primaryHistoryStorageKey]);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  const syncConversationsToCloud = useMemo(
    () => async (nextConversations: ConversationRecord[]) => {
      if (nextConversations.length === 0 || !serverHistoryHeaders) {
        return;
      }

      try {
        const response = await fetch('/api/user/coach-history', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(serverHistoryHeaders || {}),
          },
          body: JSON.stringify({ conversations: nextConversations }),
        });

        if (response.ok) {
          return;
        }
      } catch (error) {
        console.error('Server coach history save failed:', error);
      }
    },
    [serverHistoryHeaders],
  );

  useEffect(() => {
    if (!isHistoryHydrated || conversations.length === 0 || !hasMeaningfulConversations(conversations)) {
      return;
    }
    if (supabaseSyncRef.current) clearTimeout(supabaseSyncRef.current);
    supabaseSyncRef.current = setTimeout(() => {
      void syncConversationsToCloud(conversations);
    }, 500);
    return () => {
      if (supabaseSyncRef.current) clearTimeout(supabaseSyncRef.current);
    };
  }, [conversations, isHistoryHydrated, syncConversationsToCloud]);

  useEffect(() => {
    if (!serverHistoryHeaders) return;

    const flushCloudSync = () => {
      if (document.visibilityState === 'hidden') {
        if (supabaseSyncRef.current) {
          clearTimeout(supabaseSyncRef.current);
          supabaseSyncRef.current = null;
        }
        void syncConversationsToCloud(latestConversationsRef.current);
      }
    };

    const flushOnUnload = () => {
      if (supabaseSyncRef.current) {
        clearTimeout(supabaseSyncRef.current);
        supabaseSyncRef.current = null;
      }
      void syncConversationsToCloud(latestConversationsRef.current);
    };

    document.addEventListener('visibilitychange', flushCloudSync);
    window.addEventListener('beforeunload', flushOnUnload);

    return () => {
      document.removeEventListener('visibilitychange', flushCloudSync);
      window.removeEventListener('beforeunload', flushOnUnload);
    };
  }, [serverHistoryHeaders, syncConversationsToCloud]);

  useEffect(() => {
    if (initializedHistoryKeyRef.current === historyBootstrapKey) {
      return;
    }

    initializedHistoryKeyRef.current = historyBootstrapKey;
    hydratedHistoryKeyRef.current = null;

    const cached = coachConversationCache.get(primaryHistoryStorageKey);
    if (cached && cached.conversations.length > 0) {
      setConversations(cached.conversations);
      setActiveConversationId(cached.activeConversationId || cached.conversations[0].id);
      setMessages(cached.messages.length > 0 ? cached.messages : cached.conversations[0].messages);
      hydratedHistoryKeyRef.current = primaryHistoryStorageKey;
      return;
    }

    const localCandidates = historyStorageKeys
      .map((storageKey) => parseStoredConversations(window.localStorage.getItem(storageKey)))
      .filter((candidate) => candidate.length > 0);

    let stored = localCandidates.reduce<ConversationRecord[]>(
      (latest, candidate) => pickPreferredConversationSet(latest, candidate),
      [],
    );

    // One-time migration path from legacy unscoped history key to user-scoped key.
    if (stored.length === 0 && historyStorageUserIds.length > 0) {
      const legacy = parseStoredConversations(window.localStorage.getItem(JANSO_HISTORY_STORAGE_KEY));
      if (legacy.length > 0) {
        stored = legacy;
        persistConversationsToKeys(legacy, historyStorageKeys);
      }
    }

    const setInitialConversation = () => {
      const initialConversation = createConversationRecord(
        [createWelcomeMessage(channelContext)],
        channelContext?.title,
      );
      setConversations([initialConversation]);
      setActiveConversationId(initialConversation.id);
      setMessages(initialConversation.messages);
      hydratedHistoryKeyRef.current = primaryHistoryStorageKey;
    };

    const loadStoredConversationSet = (nextConversations: ConversationRecord[]) => {
      persistConversationsToKeys(nextConversations, historyStorageKeys);
      setConversations(nextConversations);
      setActiveConversationId(nextConversations[0].id);
      setMessages(nextConversations[0].messages);
      coachConversationCache.set(primaryHistoryStorageKey, {
        conversations: nextConversations,
        activeConversationId: nextConversations[0].id,
        messages: nextConversations[0].messages,
      });
      hydratedHistoryKeyRef.current = primaryHistoryStorageKey;
    };

    if (serverHistoryHeaders) {
      fetch('/api/user/coach-history', {
        credentials: 'include',
        headers: serverHistoryHeaders,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response.json();
        })
        .then((payload) => {
          const fromServer = parseStoredConversations(
            Array.isArray(payload?.conversations) ? JSON.stringify(payload.conversations) : null,
          );
          const preferredConversations = pickPreferredConversationSet(stored, fromServer);
          if (preferredConversations.length > 0) {
            loadStoredConversationSet(preferredConversations);
          } else if (stored.length > 0) {
            loadStoredConversationSet(stored);
          } else {
            setInitialConversation();
          }
        })
        .catch(() => {
          if (stored.length > 0) {
            loadStoredConversationSet(stored);
          } else {
            setInitialConversation();
          }
        });
      return;
    }

    if (stored.length > 0) {
      loadStoredConversationSet(stored);
      return;
    }

    setInitialConversation();
  }, [historyBootstrapKey, primaryHistoryStorageKey, historyStorageKeys, historyStorageUserIds.length, authUser?.id, channelContext, serverHistoryHeaders, userProfile?.id]);

  useEffect(() => {
    if (!channelContext?.id) {
      setInsightAlert(null);
      return;
    }

    let cancelled = false;

    const fetchInsightAlert = async (silent = false) => {
      if (!silent) {
        setLoadingInsightAlert(true);
      }

      try {
        const response = await fetch('/api/coach/insight-alert');
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const alert = payload?.alert;

        if (cancelled) {
          return;
        }

        if (
          alert &&
          typeof alert.id === 'string' &&
          typeof alert.headline === 'string' &&
          Array.isArray(alert.ideas)
        ) {
          if (!dismissedAlertIds.includes(alert.id)) {
            setInsightAlert(alert as InsightAlert);
          } else {
            setInsightAlert(null);
          }
        } else {
          setInsightAlert(null);
        }

        setLastAlertCheckAt(new Date().toISOString());
      } catch (error) {
        console.error('Insight alert fetch error:', error);
      } finally {
        if (!silent && !cancelled) {
          setLoadingInsightAlert(false);
        }
      }
    };

    fetchInsightAlert();

    const intervalId = window.setInterval(() => {
      fetchInsightAlert(true);
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [channelContext?.id, dismissedAlertIds]);

  useEffect(() => {
    if (!activeConversationId) return;

    setConversations((previous) => {
      const now = new Date().toISOString();
      const index = previous.findIndex((conversation) => conversation.id === activeConversationId);
      let updated = [...previous];

      if (index >= 0) {
        updated[index] = {
          ...updated[index],
          title: buildConversationTitle(messages, channelContext?.title),
          updatedAt: now,
          messages,
        };
      } else {
        updated = [
          {
            id: activeConversationId,
            title: buildConversationTitle(messages, channelContext?.title),
            createdAt: now,
            updatedAt: now,
            messages,
          },
          ...updated,
        ];
      }

      const sorted = sortConversationsByLatest(updated).slice(0, MAX_SAVED_CONVERSATIONS);
      if (hasMeaningfulConversations(sorted)) {
        persistConversationsToKeys(sorted, historyStorageKeys);
      }
      return sorted;
    });
  }, [messages, activeConversationId, channelContext?.title, historyStorageKeys]);

  const startNewConversation = () => {
    const nextConversation = createConversationRecord(
      [createWelcomeMessage(channelContext)],
      channelContext?.title,
    );

    setActiveConversationId(nextConversation.id);
    setMessages(nextConversation.messages);
    setInput('');
    setLoading(false);
    setHistoryOpen(false);
    chatRef.current = null;

    setConversations((previous) => {
      const sorted = sortConversationsByLatest([nextConversation, ...previous]).slice(0, MAX_SAVED_CONVERSATIONS);
      if (hasMeaningfulConversations(sorted)) {
        persistConversationsToKeys(sorted, historyStorageKeys);
      }
      return sorted;
    });
  };

  const openConversation = (id: string) => {
    const target = conversations.find((conversation) => conversation.id === id);
    if (!target) return;

    setActiveConversationId(target.id);
    setMessages(target.messages);
    setInput('');
    setLoading(false);
    setHistoryOpen(false);
    chatRef.current = null;
  };

  const deleteConversation = (id: string) => {
    setConversations((previous) => {
      let remaining = previous.filter((conversation) => conversation.id !== id);

      if (remaining.length === 0) {
        const fallback = createConversationRecord([createWelcomeMessage(channelContext)], channelContext?.title);
        remaining = [fallback];
        setActiveConversationId(fallback.id);
        setMessages(fallback.messages);
      } else if (activeConversationId === id) {
        const replacement = remaining[0];
        setActiveConversationId(replacement.id);
        setMessages(replacement.messages);
      }

      const sorted = sortConversationsByLatest(remaining);
      if (hasMeaningfulConversations(sorted)) {
        persistConversationsToKeys(sorted, historyStorageKeys);
      }
      return sorted;
    });

    chatRef.current = null;
  };

  const dismissInsightAlert = (alertId: string) => {
    setInsightAlert(null);
    setDismissedAlertIds((previous) => {
      if (previous.includes(alertId)) return previous;
      const next = [alertId, ...previous].slice(0, 40);
      persistDismissedAlertIds(next);
      return next;
    });
  };

  const saveConversationSnapshot = (nextMessages: Message[], conversationId = activeConversationIdRef.current) => {
    const now = new Date().toISOString();
    const previous = conversationsRef.current;
    const index = previous.findIndex((conversation) => conversation.id === conversationId);
    let updated = [...previous];

    if (index >= 0) {
      updated[index] = {
        ...updated[index],
        title: buildConversationTitle(nextMessages, channelContext?.title),
        updatedAt: now,
        messages: nextMessages,
      };
    } else {
      updated = [
        {
          id: conversationId || createConversationId(),
          title: buildConversationTitle(nextMessages, channelContext?.title),
          createdAt: now,
          updatedAt: now,
          messages: nextMessages,
        },
        ...updated,
      ];
    }

    const sorted = sortConversationsByLatest(updated).slice(0, MAX_SAVED_CONVERSATIONS);
    persistConversationsToKeys(sorted, historyStorageKeys);
    conversationsRef.current = sorted;
    setConversations(sorted);

    const resolvedActiveConversationId = sorted[0]?.id || conversationId;
    coachConversationCache.set(primaryHistoryStorageKey, {
      conversations: sorted,
      activeConversationId: resolvedActiveConversationId || '',
      messages: nextMessages,
    });
    if (resolvedActiveConversationId && resolvedActiveConversationId !== activeConversationIdRef.current) {
      activeConversationIdRef.current = resolvedActiveConversationId;
      setActiveConversationId(resolvedActiveConversationId);
    }
  };

  const startTypingEffect = (fullText: string, messageIndex: number) => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    if (!fullText.trim()) {
      setTypingState(null);
      return;
    }

    setTypingState({ fullText, messageIndex, visibleCount: 0 });

    let visibleCount = 0;
    typingIntervalRef.current = setInterval(() => {
      const chunkSize = fullText.length > 420 ? 7 : fullText.length > 180 ? 5 : 3;
      visibleCount = Math.min(fullText.length, visibleCount + chunkSize);

      setTypingState((current) => {
        if (!current || current.fullText !== fullText || current.messageIndex !== messageIndex) {
          return current;
        }

        return {
          ...current,
          visibleCount,
        };
      });

      if (visibleCount >= fullText.length && typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    }, 18);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    const nextUserMessage: Message = { role: 'user', text: userMessage };
    const updatedMessages: Message[] = [...messagesRef.current, nextUserMessage];
    setTypingState(null);
    setInput('');
    messagesRef.current = updatedMessages;
    setMessages(updatedMessages);
    saveConversationSnapshot(updatedMessages);
    setLoading(true);

    // Import BYOK utilities dynamically to avoid circular dependencies
    const { loadGeminiKey, recordAPIRequest, recordAPIError } = await import('../lib/geminiKeyStorage');
    const { classifyGeminiError } = await import('../lib/geminiErrorClassifier');
    const { getModel } = await import('../lib/modelStorage');

    try {
      
      const apiKey = await loadGeminiKey();
      if (!apiKey) {
        throw new Error('Gemini API key required. Please add your key in Settings → API Keys.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const modelId = getModel('aicoach');
      
      if (!chatRef.current) {
        const systemInstruction = `You are a world-class YouTube Growth Coach. Your goal is to help creators grow their channels through data-driven strategies, high-retention storytelling, and SEO optimization.
        
        ${channelContext ? `The user's channel is "${channelContext.title}". 
        Description: ${channelContext.description}
        Stats: ${channelContext.statistics.subscriberCount} subscribers, ${channelContext.statistics.videoCount} videos.
        Use this context to provide highly personalized advice.` : "The user hasn't connected their channel yet, so provide general best practices but encourage them to connect for personalized insights."}
        
        Focus on:
        1. Content Ideas: Viral-potential topics in their niche.
        2. Titles & Hooks: High-CTR titles and retention-focused opening scripts.
        3. Strategy: Pacing, community engagement, and monetization.
        4. SEO: Keywords and metadata.
        
        Keep your tone encouraging, professional, and actionable. Use Markdown for formatting.`;

        chatRef.current = ai.chats.create({
          model: modelId,
          config: {
            systemInstruction,
          },
          history: toGeminiHistory(messages.slice(-40)),
        });
      }

      const response = await chatRef.current.sendMessage({ message: userMessage });
      const text = response.text;
      
      // Record successful API request
      recordAPIRequest();
      
      const modelMessage: Message = { role: 'model', text: text || "I'm sorry, I couldn't process that request." };
      const nextMessages: Message[] = [...messagesRef.current, modelMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      startTypingEffect(modelMessage.text, nextMessages.length - 1);
      saveConversationSnapshot(nextMessages);
    } catch (error) {
      // Classify error for user-friendly messaging
      const classified = classifyGeminiError(error);
      
      // Record specific error types for status display
      if (classified.type === 'invalid_key' || classified.type === 'rate_limited' || classified.type === 'quota_exhausted') {
        recordAPIError(classified.type);
      }
      
      console.error('Chat error:', error);
      const modelMessage: Message = { role: 'model', text: classified.userMessage };
      const nextMessages: Message[] = [...messagesRef.current, modelMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      startTypingEffect(modelMessage.text, nextMessages.length - 1);
      saveConversationSnapshot(nextMessages);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = useMemo(() => {
    const title = String(channelContext?.title || '').trim();
    const description = String(channelContext?.description || '').toLowerCase();
    const subscribers = asNumber(channelContext?.statistics?.subscriberCount);
    const videos = asNumber(channelContext?.statistics?.videoCount);
    const hasChannel = Boolean(channelContext);
    const candidates: QuickPrompt[] = [];

    if (hasChannel) {
      if (title) {
        candidates.push({
          label: `Audit "${title}" and identify the single biggest growth bottleneck`,
          icon: Target,
          score: 110,
        });
      }

      if (videos > 0) {
        candidates.push({
          label: `Based on my ${videos} videos, pick 3 topics I should double down on`,
          icon: Lightbulb,
          score: 100,
        });
      }

      if (subscribers > 0 && subscribers < 1000) {
        candidates.push({
          label: `Give me a 30-day plan to reach my first 1,000 subscribers`,
          icon: Target,
          score: 105,
        });
      } else if (subscribers >= 1000 && subscribers < 10000) {
        candidates.push({
          label: `Build a 6-week strategy to grow from ${Math.round(subscribers).toLocaleString()} to 10K subscribers`,
          icon: Target,
          score: 105,
        });
      } else if (subscribers >= 10000) {
        candidates.push({
          label: `Design a 60-day plan to double monthly views on my channel`,
          icon: Target,
          score: 105,
        });
      }

      if (/short|shorts|reel|clip/.test(description)) {
        candidates.push({
          label: `Create a Shorts funnel that converts viewers into long-form fans`,
          icon: Sparkles,
          score: 98,
        });
      }

      candidates.push(
        {
          label: `Write 3 high-retention hooks for my next upload`,
          icon: Sparkles,
          score: 95,
        },
        {
          label: `Analyze my niche competition and suggest a positioning angle`,
          icon: MessageSquare,
          score: 92,
        },
      );
    } else {
      candidates.push(
        {
          label: `Ask me 5 questions, then build my personalized growth strategy`,
          icon: MessageSquare,
          score: 110,
        },
        {
          label: `Help me pick a profitable YouTube niche for 2026`,
          icon: Target,
          score: 105,
        },
        {
          label: `Give me 10 video ideas with strong viral potential`,
          icon: Lightbulb,
          score: 100,
        },
        {
          label: `Write 5 hook formulas I can reuse in any video`,
          icon: Sparkles,
          score: 98,
        },
      );
    }

    const fallbacks: QuickPrompt[] = [
      { label: 'Give me 5 video ideas for this week', icon: Lightbulb, score: 80 },
      { label: 'Analyze my niche and opportunities', icon: Target, score: 79 },
      { label: 'Write a viral hook for my next video', icon: Sparkles, score: 78 },
      { label: 'Give me a practical growth strategy', icon: MessageSquare, score: 77 },
    ];

    const deduped: QuickPrompt[] = [];
    const seen = new Set<string>();

    for (const prompt of [...candidates, ...fallbacks]) {
      if (seen.has(prompt.label)) continue;
      seen.add(prompt.label);
      deduped.push(prompt);
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const seed = hashString(`${title}|${userProfile?.name || ''}|${dayKey}`);

    deduped.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aHash = hashString(`${a.label}|${seed}`);
      const bHash = hashString(`${b.label}|${seed}`);
      return aHash - bHash;
    });

    return deduped.slice(0, 4).map(({ label, icon }) => ({ label, icon }));
  }, [channelContext, userProfile?.name]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const activeChannelTitle = channelContext?.title || 'Strategy Workspace';
  const userDisplayName = userProfile?.name || channelContext?.title || 'Creator';

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 rounded-[2.25rem] opacity-80 blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, rgba(34,197,94,0.14), transparent 30%), radial-gradient(circle at 85% 0%, rgba(59,130,246,0.18), transparent 32%), radial-gradient(circle at 50% 30%, rgba(244,114,182,0.12), transparent 35%)',
        }}
      />

      <div className="relative mb-5 sm:mb-6 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,39,0.94),rgba(10,13,22,0.9))] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]" />
              AI Strategy Console
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-50 sm:text-4xl">Janso</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                A cinematic growth partner for titles, hooks, content direction, and channel strategy.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Focused Channel</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100 truncate">{activeChannelTitle}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Strategist Mode</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">Retention + CTR</p>
            </div>
          </div>
        </div>
      </div>

      {channelContext?.id && (
        <div className="mb-5 rounded-[26px] border border-sky-400/20 bg-[linear-gradient(135deg,rgba(21,33,53,0.88),rgba(14,17,28,0.96))] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.28)] sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-400/10 text-sky-200">
              <BellRing size={16} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">Insight Alert</p>
                <button
                  onClick={() => {
                    setLoadingInsightAlert(true);
                    fetch('/api/coach/insight-alert')
                      .then((response) => (response.ok ? response.json() : null))
                      .then((payload) => {
                        const alert = payload?.alert;
                        if (
                          alert &&
                          typeof alert.id === 'string' &&
                          typeof alert.headline === 'string' &&
                          Array.isArray(alert.ideas) &&
                          !dismissedAlertIds.includes(alert.id)
                        ) {
                          setInsightAlert(alert as InsightAlert);
                        }
                        setLastAlertCheckAt(new Date().toISOString());
                      })
                      .catch((error) => {
                        console.error('Manual insight alert refresh failed:', error);
                      })
                      .finally(() => setLoadingInsightAlert(false));
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.07] transition-colors"
                >
                  <RefreshCw size={12} className={cn(loadingInsightAlert && 'animate-spin')} />
                  Refresh
                </button>
              </div>

              {insightAlert ? (
                <div className="mt-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{insightAlert.headline}</p>
                      <p className="text-xs text-zinc-400 mt-1">{insightAlert.summary}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        {insightAlert.signalType === 'retention' ? 'Based on retention data' : 'Based on retention proxy signals'}
                        {lastAlertCheckAt ? ` • Updated ${formatRelativeTime(lastAlertCheckAt)}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissInsightAlert(insightAlert.id)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                      aria-label="Dismiss insight alert"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                    {insightAlert.ideas.slice(0, 3).map((idea, index) => (
                      <button
                        key={`${insightAlert.id}-${index}`}
                        onClick={() => {
                          setInput(`Let's execute this insight alert idea: ${idea}`);
                        }}
                        className="text-left rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 hover:border-sky-300/40 hover:bg-white/[0.08] transition-colors"
                      >
                        <span className="text-sky-200 font-semibold">Idea {index + 1}:</span> {idea}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 mt-2">
                  {loadingInsightAlert
                    ? 'Analyzing your latest channel patterns...'
                    : 'No active trend alert right now. We will keep monitoring your channel patterns automatically.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[34rem] overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,30,0.96),rgba(8,10,18,0.98))] shadow-[0_30px_100px_rgba(0,0,0,0.5)] sm:min-h-[40rem] lg:min-h-[46rem]">
        {/* Chat Header */}
        <div className="flex items-center gap-2 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-4 py-4 md:gap-3 md:px-6">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200 md:h-10 md:w-10">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-[-0.02em] text-zinc-50">{activeConversation?.title || 'Janso'}</h2>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500">Live strategist</span>
            </div>
          </div>
          <div className="ml-2 hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-300 sm:block">
            Speaking with {userDisplayName}
          </div>
          <div className="ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            <button
              onClick={startNewConversation}
              title="New Chat"
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] md:gap-1.5 md:px-3"
            >
              <Plus size={12} className="md:hidden" />
              <Plus size={14} className="hidden md:block" />
              <span className="hidden sm:inline">New</span>
            </button>
            <button
              onClick={() => setHistoryOpen((prev) => !prev)}
              title={historyOpen ? "Close history" : "Open history"}
              className={cn(
                'inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-medium rounded-lg transition-colors',
                historyOpen
                  ? 'border border-cyan-300/30 bg-cyan-400/15 text-cyan-100'
                  : 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]',
              )}
            >
              <History size={12} className="md:hidden" />
              <History size={14} className="hidden md:block" />
              <span className="hidden sm:inline">({conversations.length})</span>
            </button>
          </div>
        </div>

        {historyOpen && (
          <div className="max-h-48 overflow-y-auto border-b border-white/8 bg-black/20 px-3 py-3 md:max-h-56 md:px-4">
            {conversations.length === 0 ? (
              <p className="text-xs text-zinc-500">No saved conversations yet.</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      'flex items-start gap-2 rounded-2xl border px-3 py-2',
                      conversation.id === activeConversationId
                        ? 'border-cyan-300/30 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.08)]'
                        : 'border-white/8 bg-white/[0.03]',
                    )}
                  >
                    <button
                      onClick={() => openConversation(conversation.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs md:text-xs font-medium text-zinc-200 truncate">{conversation.title}</p>
                      <p className="text-[10px] md:text-[11px] text-zinc-500 mt-0.5">
                        {formatRelativeTime(conversation.updatedAt)} • {Math.max(conversation.messages.length - 1, 0)} msgs
                      </p>
                    </button>
                    <button
                      onClick={() => deleteConversation(conversation.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition-colors flex-shrink-0"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={12} className="md:hidden" />
                      <Trash2 size={14} className="hidden md:block" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-[22rem] space-y-5 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.06),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.015),transparent)] p-3 scroll-smooth sm:min-h-[28rem] md:p-6 lg:min-h-[34rem]"
        >
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={cn(
                "flex gap-2 md:gap-4 max-w-full md:max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {msg.role === 'user' ? (
                userProfile?.picture || channelContext?.thumbnails ? (
                  <img
                    src={userProfile?.picture || channelContext?.thumbnails?.default?.url}
                    alt={userProfile?.name || channelContext?.title || 'User'}
                    className="w-6 md:w-8 h-6 md:h-8 rounded-full flex-shrink-0 border border-zinc-700 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 md:w-8 h-6 md:h-8 rounded-full flex-shrink-0 bg-zinc-800 text-zinc-400 flex items-center justify-center flex-shrink-0">
                    <UserIcon size={12} className="md:hidden" />
                    <UserIcon size={16} className="hidden md:block" />
                  </div>
                )
              ) : (
                <div className="w-6 md:w-8 h-6 md:h-8 rounded-full flex-shrink-0 bg-indigo-500 text-white flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="md:hidden" />
                  <Bot size={16} className="hidden md:block" />
                </div>
              )}
              <div className={cn(
                "relative overflow-hidden rounded-[22px] px-3 py-2.5 text-xs leading-relaxed shadow-[0_18px_45px_rgba(0,0,0,0.18)] md:px-4 md:py-3 md:text-sm",
                msg.role === 'user'
                  ? "rounded-tr-md border border-white/8 bg-[linear-gradient(135deg,rgba(37,45,67,0.96),rgba(26,30,45,0.98))] text-zinc-100"
                  : "rounded-tl-md border border-cyan-300/10 bg-[linear-gradient(135deg,rgba(11,15,24,0.96),rgba(16,25,35,0.98))] text-zinc-200 markdown-body"
              )}>
                {msg.role === 'model' && (
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/10 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    Janso
                  </div>
                )}
                <Markdown>
                  {typingState && typingState.messageIndex === i && typingState.fullText === msg.text
                    ? `${msg.text.slice(0, typingState.visibleCount)}${typingState.visibleCount < typingState.fullText.length ? '▍' : ''}`
                    : msg.text}
                </Markdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 md:gap-4 mr-auto max-w-full md:max-w-[85%]">
              <div className="w-6 md:w-8 h-6 md:h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={12} className="md:hidden" />
                <Bot size={16} className="hidden md:block" />
              </div>
              <div className="flex items-center gap-2 rounded-[22px] rounded-tl-md border border-cyan-300/10 bg-[linear-gradient(135deg,rgba(11,15,24,0.96),rgba(16,25,35,0.98))] px-3 py-2 md:px-4 md:py-3">
                <Loader2 size={14} className="animate-spin text-indigo-400 md:hidden" />
                <Loader2 size={16} className="animate-spin text-indigo-400 hidden md:block" />
                <span className="text-[10px] font-medium italic text-zinc-500 md:text-xs">Janso is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 px-3 pb-4 md:px-6">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(p.label);
                }}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-zinc-200 transition-colors hover:border-cyan-300/30 hover:bg-cyan-400/10 md:px-3 md:text-xs"
              >
                <p.icon size={12} className="text-indigo-400 md:hidden" />
                <p.icon size={14} className="text-indigo-400 hidden md:block" />
                <span className="hidden sm:inline">{p.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-3 md:p-4">
          <div className="relative flex items-center gap-2 md:gap-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask for hooks, titles, strategy, angles..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 pl-4 pr-11 py-3 text-xs text-zinc-100 backdrop-blur-sm transition-all focus:border-cyan-300/30 focus:outline-none focus:ring-2 focus:ring-cyan-300/20 md:pr-12 md:text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#22d3ee,#3b82f6)] text-white shadow-[0_10px_30px_rgba(37,99,235,0.45)] transition-all hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:w-9"
              title="Send message"
            >
              <Send size={14} className="md:hidden" />
              <Send size={18} className="hidden md:block" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
            <span>Powered by Gemini 2.5 Flash</span>
            <span>Shift the conversation into hooks, titles, retention, or positioning</span>
          </div>
        </div>
      </div>
    </div>
  );
}
