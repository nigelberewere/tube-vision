import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Bot, 
  User as UserIcon, 
  Loader2, 
  Sparkles, 
  Lightbulb, 
  Target, 
  MessageSquare
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

export default function AICoach({ channelContext, userProfile }: AICoachProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'model', 
      text: `Hi! I'm Janso. ${channelContext ? `I've analyzed your channel "${channelContext.title}" and I'm ready to help you grow.` : "Connect your channel for personalized advice, or just ask me anything about YouTube growth!"} How can I help you today?` 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
          model: "gemini-3.1-pro-preview",
          config: {
            systemInstruction,
          },
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

  const quickPrompts = [
    { label: "Give me 5 video ideas", icon: Lightbulb },
    { label: "Analyze my niche", icon: Target },
    { label: "Write a viral hook", icon: Sparkles },
    { label: "Growth strategy", icon: MessageSquare },
  ];

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
            <h2 className="text-sm font-bold text-zinc-100">Janso</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Online & Ready</span>
            </div>
          </div>
        </div>

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
            Powered by Gemini 3.1 Pro • Actionable strategies for YouTube growth
          </p>
        </div>
      </div>
    </div>
  );
}
