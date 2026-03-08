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
  Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AICoachProps {
  channelContext?: any;
  userProfile?: {
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

const JANSO_HISTORY_STORAGE_KEY = 'janso_chat_history_v1';
const MAX_SAVED_CONVERSATIONS = 20;

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

function persistConversations(conversations: ConversationRecord[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    JANSO_HISTORY_STORAGE_KEY,
    JSON.stringify(conversations.slice(0, MAX_SAVED_CONVERSATIONS)),
  );
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
  const [messages, setMessages] = useState<Message[]>([createWelcomeMessage(channelContext)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const stored = parseStoredConversations(window.localStorage.getItem(JANSO_HISTORY_STORAGE_KEY));
    if (stored.length > 0) {
      setConversations(stored);
      setActiveConversationId(stored[0].id);
      setMessages(stored[0].messages);
      return;
    }

    const initialConversation = createConversationRecord(
      [createWelcomeMessage(channelContext)],
      channelContext?.title,
    );
    setConversations([initialConversation]);
    setActiveConversationId(initialConversation.id);
    setMessages(initialConversation.messages);
    persistConversations([initialConversation]);
  }, []);

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
      persistConversations(sorted);
      return sorted;
    });
  }, [messages, activeConversationId, channelContext?.title]);

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
      persistConversations(sorted);
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
      persistConversations(sorted);
      return sorted;
    });

    chatRef.current = null;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing VITE_GEMINI_API_KEY in .env.local. Add it and restart the dev server.');
      }

      const ai = new GoogleGenAI({ apiKey });
      
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
          model: "gemini-2.5-flash",
          config: {
            systemInstruction,
          },
          history: toGeminiHistory(messages.slice(-40)),
        });
      }

      const response = await chatRef.current.sendMessage({ message: userMessage });
      const text = response.text;
      
      setMessages(prev => [...prev, { role: 'model', text: text || "I'm sorry, I couldn't process that request." }]);
    } catch (error) {
      console.error('Chat error:', error);
      const message = error instanceof Error ? error.message : 'Sorry, I encountered an error. Please try again.';
      setMessages(prev => [...prev, { role: 'model', text: message }]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Janso</h1>
        <p className="text-zinc-400 mt-2">Your personal 24/7 strategist for content ideas, hooks, and growth.</p>
      </div>

      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Chat Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">{activeConversation?.title || 'Janso'}</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Online & Ready</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={startNewConversation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Chat
            </button>
            <button
              onClick={() => setHistoryOpen((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                historyOpen
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-300 bg-zinc-800 hover:bg-zinc-700',
              )}
            >
              <History size={14} />
              History ({conversations.length})
            </button>
          </div>
        </div>

        {historyOpen && (
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/60 max-h-56 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-zinc-500">No saved conversations yet.</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-2 py-2',
                      conversation.id === activeConversationId
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-zinc-800 bg-zinc-900/60',
                    )}
                  >
                    <button
                      onClick={() => openConversation(conversation.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-medium text-zinc-200 truncate">{conversation.title}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {formatRelativeTime(conversation.updatedAt)} • {Math.max(conversation.messages.length - 1, 0)} messages
                      </p>
                    </button>
                    <button
                      onClick={() => deleteConversation(conversation.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={14} />
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
          className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
        >
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={cn(
                "flex gap-4 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {msg.role === 'user' ? (
                userProfile?.picture || channelContext?.thumbnails ? (
                  <img
                    src={userProfile?.picture || channelContext?.thumbnails?.default?.url}
                    alt={userProfile?.name || channelContext?.title || 'User'}
                    className="w-8 h-8 rounded-full flex-shrink-0 border border-zinc-700 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full flex-shrink-0 bg-zinc-800 text-zinc-400 flex items-center justify-center">
                    <UserIcon size={16} />
                  </div>
                )
              ) : (
                <div className="w-8 h-8 rounded-full flex-shrink-0 bg-indigo-500 text-white flex items-center justify-center">
                  <Bot size={16} />
                </div>
              )}
              <div className={cn(
                "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-zinc-800 text-zinc-100 rounded-tr-none" 
                  : "bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-tl-none markdown-body"
              )}>
                <Markdown>{msg.text}</Markdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4 mr-auto max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-indigo-400" />
                <span className="text-xs text-zinc-500 font-medium italic">Janso is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        {messages.length === 1 && (
          <div className="px-6 pb-4 flex flex-wrap gap-2">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(p.label);
                }}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              >
                <p.icon size={14} className="text-indigo-400" />
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Janso anything..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2 text-center">
            Powered by Gemini 2.5 Flash • Actionable strategies for YouTube growth
          </p>
        </div>
      </div>
    </div>
  );
}
