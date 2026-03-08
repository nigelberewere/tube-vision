import { useState, useEffect, type ComponentType } from 'react';
import {
  LayoutDashboard,
  Search,
  FileText,
  Youtube,
  Image as ImageIcon,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  BarChart4,
  GraduationCap,
  Lightbulb,
  Users,
  LineChart as LineChartIcon,
  Play,
  Mic,
} from 'lucide-react';
import { cn } from './lib/utils';
import SEOOptimizer from './components/SEOOptimizer';
import ContentStrategy from './components/ContentStrategy';
import KeywordResearch from './components/KeywordResearch';
import ScriptArchitect from './components/ScriptArchitect';
import ThumbnailConcepting from './components/ThumbnailConcepting';
import HomeDashboard from './components/HomeDashboard';
import ChannelAnalysis from './components/ChannelAnalysis';
import AICoach from './components/AICoach';
import VideoIdeaGenerator from './components/VideoIdeaGenerator';
import CompetitorAnalysis from './components/CompetitorAnalysis';
import ChannelInsights from './components/ChannelInsights';
import VideoList from './components/VideoList';
import VoiceOver from './components/VoiceOver';
import ViralClipExtractor from './components/ViralClipExtractor';
import YouTubeShortsIcon from './components/icons/YouTubeShortsIcon';
import YouTubeLogoIcon from './components/icons/YouTubeLogoIcon';
import YouTubeMyVideosIcon from './components/icons/YouTubeMyVideosIcon';

type Tab =
  | 'home'
  | 'seo'
  | 'strategy'
  | 'keywords'
  | 'script'
  | 'thumbnail'
  | 'channel'
  | 'coach'
  | 'ideas'
  | 'competitors'
  | 'insights'
  | 'videos'
  | 'voiceover'
  | 'clips';

interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnails: any;
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
}

interface User {
  id: string;
  name: string;
  picture: string;
  channel: YouTubeChannel | null;
}

interface TabConfig {
  id: Tab;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  section: 'overview' | 'studios' | 'growth';
  summary: string;
}

const CHANNEL_REQUIRED_TABS: Tab[] = ['channel', 'competitors', 'insights', 'videos'];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const tabs: TabConfig[] = [
    {
      id: 'home',
      label: 'Home',
      icon: LayoutDashboard,
      section: 'overview',
      summary: 'Track your channel pulse: subscribers, last-hour views, and daily momentum.',
    },
    {
      id: 'voiceover',
      label: 'Neural Voice Studio',
      icon: Mic,
      section: 'studios',
      summary: 'Generate cinematic AI voiceovers and expressive narration.',
    },
    {
      id: 'clips',
      label: 'YouTube Shorts Studio',
      icon: YouTubeShortsIcon,
      section: 'studios',
      summary: 'Create Shorts from your long-form videos and remix top niche performers.',
    },
    {
      id: 'thumbnail',
      label: 'Thumbnail Studio',
      icon: ImageIcon,
      section: 'studios',
      summary: 'Audit poor thumbnails, auto-generate upgrade concepts, and authorize swaps.',
    },
    {
      id: 'seo',
      label: 'SEO Optimizer',
      icon: Search,
      section: 'growth',
      summary: 'Build higher CTR titles, tags, and metadata packs.',
    },
    {
      id: 'strategy',
      label: 'Content Strategy',
      icon: LayoutDashboard,
      section: 'growth',
      summary: 'Analyze pacing and retention risks in your scripts.',
    },
    {
      id: 'keywords',
      label: 'Keyword Research',
      icon: Youtube,
      section: 'growth',
      summary: 'Discover topics with low competition and strong demand.',
    },
    {
      id: 'script',
      label: 'Script Architect',
      icon: FileText,
      section: 'growth',
      summary: 'Draft hooks, story arcs, and conversion-focused CTAs.',
    },
    {
      id: 'videos',
      label: 'My Videos',
      icon: Play,
      section: 'growth',
      summary: 'Review channel uploads and prioritize improvements.',
    },
    {
      id: 'channel',
      label: 'Channel Analysis',
      icon: BarChart4,
      section: 'growth',
      summary: 'Inspect growth trends with channel-level intelligence.',
    },
    {
      id: 'coach',
      label: 'AI YouTube Coach',
      icon: GraduationCap,
      section: 'growth',
      summary: 'Get personalized growth coaching and action plans.',
    },
    {
      id: 'ideas',
      label: 'Video Idea Generator',
      icon: Lightbulb,
      section: 'growth',
      summary: 'Generate publish-ready concepts based on audience intent.',
    },
    {
      id: 'competitors',
      label: 'Competitor Analysis',
      icon: Users,
      section: 'growth',
      summary: 'Reverse-engineer competitor wins and content patterns.',
    },
    {
      id: 'insights',
      label: 'Channel Insights',
      icon: LineChartIcon,
      section: 'growth',
      summary: 'Surface trends and opportunities from your performance data.',
    },
  ];

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const overviewTabs = tabs.filter((tab) => tab.section === 'overview');
  const studioTabs = tabs.filter((tab) => tab.section === 'studios');
  const growthTabs = tabs.filter((tab) => tab.section === 'growth');
  const requiresChannelConnection = CHANNEL_REQUIRED_TABS.includes(activeTab);
  const showMyVideosConnectIcon = activeTab === 'videos';

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/user/channel');
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    fetchUser();

    const handleMessage = (event: MessageEvent) => {
      // Security: validate message origin in production
      // if (process.env.NODE_ENV === 'production' && event.origin !== window.location.origin) {
      //   return;
      // }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log('OAuth success message received');
        fetchUser();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Close profile menu when sidebar closes (mobile)
  useEffect(() => {
    if (!isSidebarOpen) {
      setIsProfileMenuOpen(false);
    }
  }, [isSidebarOpen]);

  const handleConnect = async () => {
    try {
      console.log('[Connect] Fetching auth URL...');
      const response = await fetch('/api/auth/google/url');

      const raw = await response.text();
      let data: any = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { raw };
        }
      }

      if (!response.ok) {
        console.error('[Connect Error] Response not ok:', response.status, data);
        const message = data.error || `Failed to get authorization URL (HTTP ${response.status}).`;
        alert(message);
        return;
      }

      console.log('[Connect] Auth URL received, length:', data.url?.length);
      
      if (!data.url) {
        console.error('[Connect Error] No URL in response:', data);
        alert('Failed to generate auth URL');
        return;
      }

      const popup = window.open(data.url, 'oauth_popup', 'width=600,height=700,scrollbars=yes');
      
      if (!popup) {
        console.error('[Connect Error] Popup blocked or could not open');
        alert('Popup was blocked. Please allow popups and try again.');
        return;
      }

      console.log('[Connect] Popup opened, polling for closure...');
      
      // Poll to check if popup closed or auth succeeded
      const checkInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkInterval);
          console.log('[Connect] Popup closed, refreshing user...');
          // Refresh user state when popup closes
          fetchUser();
        }
      }, 500);
      
      // Safety timeout: stop checking after 5 minutes
      setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
    } catch (error) {
      console.error('[Connect Error] Exception:', error);
      alert('An error occurred. Check browser console for details.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      if (CHANNEL_REQUIRED_TABS.includes(activeTab)) {
        setActiveTab('voiceover');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const renderSectionHelper = () => {
    if (activeTab === 'voiceover') {
      return (
        <div className="mb-8 rounded-2xl border border-blue-400/20 bg-blue-500/5 backdrop-blur-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Neural Voice Workflow</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Smart Tag Your Script</p>
              <p className="text-xs text-slate-400 mt-1">Use Smart Tagging to auto-insert emotional and pacing cues.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Preview Voices</p>
              <p className="text-xs text-slate-400 mt-1">Test multiple voice models before generating full narration.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Tune Delivery</p>
              <p className="text-xs text-slate-400 mt-1">Adjust pitch, speed, and volume to match your video mood.</p>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'clips') {
      return (
        <div className="mb-8 rounded-2xl border border-red-400/20 bg-red-500/5 backdrop-blur-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">YouTube Shorts Workflow</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Start From My Channel</p>
              <p className="text-xs text-slate-400 mt-1">Pick any long-form upload and auto-generate Shorts candidates.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Study Niche Winners</p>
              <p className="text-xs text-slate-400 mt-1">Pull high-performing Shorts and extract remix-ready patterns.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Render 9:16 Cuts</p>
              <p className="text-xs text-slate-400 mt-1">Generate vertical clips with hook text and social copy included.</p>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'thumbnail') {
      return (
        <div className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-500/5 backdrop-blur-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Thumbnail Studio Workflow</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Auto Audit Your Library</p>
              <p className="text-xs text-slate-400 mt-1">Detect low-performing videos likely impacted by weak thumbnail clickability.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Generate Upgrade Concepts</p>
              <p className="text-xs text-slate-400 mt-1">Create text overlays, visual layout plans, and emotional hook directions automatically.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white">Authorize Thumbnail Swaps</p>
              <p className="text-xs text-slate-400 mt-1">Review proposed swaps and approve a queue for creator-side execution.</p>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'videos' && user) {
      return (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 backdrop-blur-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Library Focus</p>
          <p className="text-sm text-slate-300 mt-2">
            Use your video library to identify strong long-form candidates, then move to YouTube Shorts Studio to cut them into high-retention short formats.
          </p>
        </div>
      );
    }

    return null;
  };

  const renderContent = () => {
    if (requiresChannelConnection && !user) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-6">
          <div
            className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center',
              showMyVideosConnectIcon ? 'bg-white text-black' : 'bg-white/10 text-slate-200',
            )}
          >
            {showMyVideosConnectIcon ? <YouTubeMyVideosIcon size={42} /> : <Youtube size={40} />}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Connect your channel</h2>
            <p className="text-slate-400 max-w-md">
              You need to connect your YouTube channel to access deep analysis, pattern recognition, and personalized optimizations.
            </p>
          </div>
          <button
            onClick={handleConnect}
            className="bg-white hover:bg-slate-200 text-black px-8 py-3 rounded-xl font-bold transition-all inline-flex items-center gap-2"
          >
            <YouTubeLogoIcon size={18} />
            Connect Now
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return <HomeDashboard channel={user?.channel || null} isConnected={Boolean(user)} onConnect={handleConnect} />;
      case 'seo':
        return <SEOOptimizer />;
      case 'strategy':
        return <ContentStrategy />;
      case 'keywords':
        return <KeywordResearch />;
      case 'script':
        return <ScriptArchitect />;
      case 'thumbnail':
        return <ThumbnailConcepting />;
      case 'voiceover':
        return <VoiceOver />;
      case 'clips':
        return <ViralClipExtractor />;
      case 'videos':
        return <VideoList />;
      case 'channel':
        return <ChannelAnalysis />;
      case 'coach':
        return <AICoach channelContext={user?.channel} />;
      case 'ideas':
        return <VideoIdeaGenerator channelContext={user?.channel} />;
      case 'competitors':
        return <CompetitorAnalysis />;
      case 'insights':
        return <ChannelInsights />;
      default:
        return <HomeDashboard channel={user?.channel || null} isConnected={Boolean(user)} onConnect={handleConnect} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-slate-200 font-sans selection:bg-white/20 selection:text-white">
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#0a0a0a] rounded-md border border-white/10"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 bg-[#0a0a0a] border-r border-white/10 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:block flex flex-col',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-6 py-6 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
            <Youtube size={20} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-white">Tube Vision</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Neural Interface</p>
          </div>
        </div>

        <nav className="p-4 space-y-5 flex-1 overflow-y-auto">
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Overview</p>
            {overviewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                    activeTab === tab.id
                      ? 'bg-white/10 text-white border-white/20'
                      : 'text-slate-300 border-transparent hover:bg-white/5 hover:border-white/10',
                  )}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Studios</p>
            {studioTabs.map((tab) => {
              const Icon = tab.icon;
              const iconColor = 
                tab.id === 'voiceover' ? 'text-blue-400' :
                tab.id === 'clips' ? 'text-red-400' :
                tab.id === 'thumbnail' ? 'text-green-400' :
                undefined;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                    activeTab === tab.id
                      ? 'bg-white/10 text-white border-white/20'
                      : 'text-slate-300 border-transparent hover:bg-white/5 hover:border-white/10',
                  )}
                >
                  <Icon size={18} className={iconColor} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Growth OS</p>
            {growthTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                    activeTab === tab.id
                      ? 'bg-white/10 text-white border-white/20'
                      : 'text-slate-400 border-transparent hover:bg-white/5 hover:text-slate-200 hover:border-white/10',
                  )}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-white/10">
          {loadingUser ? (
            <div className="h-12 bg-white/5 animate-pulse rounded-lg"></div>
          ) : user ? (
            <div className="relative">
              {/* Profile Menu Dropdown */}
              {isProfileMenuOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsProfileMenuOpen(false)}
                  />
                  
                  {/* Menu */}
                  <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[#1a1a1a] border border-white/20 rounded-xl shadow-2xl overflow-hidden">
                    <div className="p-3 border-b border-white/10 bg-white/5">
                      <p className="text-xs font-semibold text-white truncate">{user.channel?.title || user.name}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {user.channel ? `${Number(user.channel.statistics.subscriberCount).toLocaleString()} subscribers` : 'No channel'}
                      </p>
                    </div>
                    
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleConnect();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Users size={16} />
                        <span>Add Another Account</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      >
                        <LogOut size={16} />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
              
              {/* Profile Button */}
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <img
                  src={user.channel?.thumbnails?.default?.url || user.picture}
                  alt={user.name}
                  className="w-10 h-10 rounded-full border border-white/20 group-hover:border-white/40 transition-colors"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-slate-100">
                    {user.channel?.title || user.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate group-hover:text-slate-300">
                    {user.channel ? `${Number(user.channel.statistics.subscriberCount).toLocaleString()} subscribers` : 'No channel found'}
                  </p>
                </div>
                <Menu size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors"
            >
              <YouTubeLogoIcon size={18} />
              Connect YouTube
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#050505]">
        <div className="max-w-6xl mx-auto p-6 lg:p-10">
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Workspace</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-1">{activeTabConfig.label}</h1>
                <p className="text-sm text-slate-400 mt-2 max-w-3xl">{activeTabConfig.summary}</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-white/15 bg-white/[0.04] w-fit">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Neural Mode</span>
              </div>
            </div>
          </div>

          {renderSectionHelper()}

          {!user && !loadingUser && !requiresChannelConnection && activeTab !== 'home' && (
            <div className="mb-8 bg-white/[0.04] border border-white/15 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-200 flex-shrink-0">
                <ShieldCheck size={24} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-lg font-bold text-white">Connect your channel for better insights</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Tube Vision works best when it can analyze your real channel data. Connect your YouTube account to unlock personalized growth strategies.
                </p>
              </div>
              <button
                onClick={handleConnect}
                className="whitespace-nowrap bg-white hover:bg-slate-200 text-black px-6 py-2.5 rounded-xl font-bold text-sm transition-all inline-flex items-center gap-2"
              >
                <YouTubeLogoIcon size={16} />
                Get Started
              </button>
            </div>
          )}

          {renderContent()}
        </div>
      </main>
    </div>
  );
}
