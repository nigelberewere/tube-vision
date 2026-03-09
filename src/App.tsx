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
  Settings2,
  Share2,
  MessageSquare,
} from 'lucide-react';
import { cn } from './lib/utils';
import SEOOptimizer from './components/SEOOptimizer';
import ContentStrategy from './components/ContentStrategy';
import KeywordResearch from './components/KeywordResearch';
import ScriptArchitect from './components/ScriptArchitect';
import ThumbnailConcepting from './components/ThumbnailConcepting.tsx';
import HomeDashboard from './components/HomeDashboard';
import ChannelAnalysis from './components/ChannelAnalysis';
import AICoach from './components/AICoach';
import VideoIdeaGenerator from './components/VideoIdeaGenerator';
import CompetitorAnalysis from './components/CompetitorAnalysis';
import ChannelInsights from './components/ChannelInsights';
import VideoList from './components/VideoList';
import VoiceOver from './components/VoiceOver';
import ViralClipExtractor from './components/ViralClipExtractor.tsx';
import ContentRepurposer from './components/ContentRepurposer';
import CommentStrategist from './components/CommentStrategist';
import CollaborationEngine from './components/CollaborationEngine';
import OnboardingTour, { type OnboardingStep } from './components/OnboardingTour';
import SettingsPanel from './components/SettingsPanel';
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
  | 'clips'
  | 'repurpose'
  | 'comments'
  | 'collaborators'
  | 'settings';

type Theme = 'dark' | 'light';

type TourStep = OnboardingStep & {
  focusTab?: Tab;
};

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
const ONBOARDING_STORAGE_KEY = 'tube_vision_onboarding_completed_v1';
const ONBOARDING_STEPS: TourStep[] = [
  {
    targetId: 'tour-home-tab',
    title: 'Home Starts Here',
    description: 'This is your dashboard command center where your daily channel metrics and momentum are tracked.',
    focusTab: 'home',
  },
  {
    targetId: 'tour-studios-section',
    title: 'Studios: Create Fast',
    description: 'Use Neural Voice, Shorts Studio, and Thumbnail Studio to produce content assets quickly.',
  },
  {
    targetId: 'tour-growth-section',
    title: 'Growth OS: Optimize Results',
    description: 'Everything here helps improve your titles, scripts, analytics, and strategic growth decisions.',
  },
  {
    targetId: 'tour-account-entry',
    title: 'Your Channel Identity',
    description: 'Connect, switch, or manage channel accounts from here so data and actions stay personalized.',
  },
  {
    targetId: 'tour-settings-entry',
    title: 'Settings & Theme',
    description: 'Click your account in the bottom-left corner, then open Settings to switch dark/light mode.',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    const savedTheme = window.localStorage.getItem('tube_vision_theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [seoVideoTopic, setSeoVideoTopic] = useState<string>('');
  const [scriptTopic, setScriptTopic] = useState<string>('');

  const tabs: TabConfig[] = [
    {
      id: 'home',
      label: 'Home',
      icon: LayoutDashboard,
      section: 'overview',
      summary: 'Track your channel pulse: subscribers, last-hour views, and daily momentum.',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings2,
      section: 'overview',
      summary: 'Customize your workspace preferences, including dark and light mode.',
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
      id: 'repurpose',
      label: 'Content Repurposer',
      icon: Share2,
      section: 'studios',
      summary: 'Transform scripts into Twitter threads, LinkedIn posts, and blog articles.',
    },
    {
      id: 'thumbnail',
      label: 'Thumbnail Studio',
      icon: ImageIcon,
      section: 'studios',
      summary: 'Audit poor thumbnails, auto-generate upgrade concepts, and apply upgrades.',
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
      id: 'comments',
      label: 'Comment Strategist',
      icon: MessageSquare,
      section: 'growth',
      summary: 'Analyze viewer comments to find requests, pain points, and content ideas.',
    },
    {
      id: 'collaborators',
      label: 'Collaboration Engine',
      icon: Users,
      section: 'growth',
      summary: 'Find creators in your niche and draft personalized outreach emails.',
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
  const overviewTabs = tabs.filter((tab) => tab.section === 'overview' && tab.id !== 'settings');
  const studioTabs = tabs.filter((tab) => tab.section === 'studios');
  const growthTabs = tabs.filter((tab) => tab.section === 'growth');
  const requiresChannelConnection = CHANNEL_REQUIRED_TABS.includes(activeTab);
  const showMyVideosConnectIcon = activeTab === 'videos';

  const fetchUser = async () => {
    try {
      // Fetch all accounts
      const accountsResponse = await fetch('/api/user/accounts');
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        setAccounts(accountsData.accounts || []);
        setActiveAccountIndex(accountsData.activeIndex || 0);
        
        // Fetch active account details
        if (accountsData.accounts && accountsData.accounts.length > 0) {
          const channelResponse = await fetch('/api/user/channel');
          if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            setUser(channelData);
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
        setAccounts([]);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
      setAccounts([]);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const completed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!completed) {
      setIsOnboardingOpen(true);
      setOnboardingStepIndex(0);
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(true);
      }
    }
  }, []);

  // Close profile menu when sidebar closes (mobile)
  useEffect(() => {
    if (!isSidebarOpen) {
      setIsProfileMenuOpen(false);
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      return;
    }

    const step = ONBOARDING_STEPS[onboardingStepIndex];
    if (step?.focusTab) {
      setActiveTab(step.focusTab);
    }

    if (step?.targetId === 'tour-settings-entry' && user) {
      setIsProfileMenuOpen(true);
    } else {
      setIsProfileMenuOpen(false);
    }

    if (window.innerWidth < 1024) {
      setIsSidebarOpen(true);
    }
  }, [isOnboardingOpen, onboardingStepIndex, user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tube_vision_theme', theme);
    }
  }, [theme]);

  const finishOnboarding = () => {
    setIsOnboardingOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    }
  };

  const handleOnboardingNext = () => {
    if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
      finishOnboarding();
      return;
    }

    setOnboardingStepIndex((prev) => prev + 1);
  };

  const handleOnboardingSkip = () => {
    finishOnboarding();
  };

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

      console.log('[Connect] Popup opened, waiting for OAuth completion...');

      const previousAccountCount = accounts.length;
      const previousActiveChannelId = user?.channel?.id || null;

      // Poll account state instead of popup.closed to avoid COOP warnings in modern browsers.
      const checkInterval = window.setInterval(async () => {
        try {
          const accountsResponse = await fetch('/api/user/accounts');
          if (!accountsResponse.ok) {
            return;
          }

          const accountsData = await accountsResponse.json();
          const nextAccounts = Array.isArray(accountsData.accounts) ? accountsData.accounts : [];
          const nextActiveIndex = Number.isInteger(accountsData.activeIndex) ? accountsData.activeIndex : 0;
          const nextActiveChannelId = nextAccounts[nextActiveIndex]?.channel?.id || null;

          const accountAdded = nextAccounts.length > previousAccountCount;
          const activeChannelChanged = Boolean(nextActiveChannelId && nextActiveChannelId !== previousActiveChannelId);

          if (accountAdded || activeChannelChanged) {
            window.clearInterval(checkInterval);
            console.log('[Connect] OAuth state updated, refreshing user...');
            fetchUser();
          }
        } catch {
          // Ignore transient polling errors while OAuth flow is in progress.
        }
      }, 1500);

      // Safety timeout: stop checking after 2 minutes
      window.setTimeout(() => window.clearInterval(checkInterval), 2 * 60 * 1000);
    } catch (error) {
      console.error('[Connect Error] Exception:', error);
      alert('An error occurred. Check browser console for details.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setAccounts([]);
      setActiveAccountIndex(0);
      if (CHANNEL_REQUIRED_TABS.includes(activeTab)) {
        setActiveTab('voiceover');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSwitchAccount = async (index: number) => {
    try {
      const response = await fetch('/api/user/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      
      if (response.ok) {
        await fetchUser();
        setIsProfileMenuOpen(false);
      }
    } catch (error) {
      console.error('Switch account error:', error);
    }
  };

  const handleRemoveAccount = async (index: number) => {
    if (!confirm('Remove this account?')) return;
    
    try {
      const response = await fetch('/api/user/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      
      if (response.ok) {
        await fetchUser();
      }
    } catch (error) {
      console.error('Remove account error:', error);
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
        return (
          <HomeDashboard
            channel={user?.channel || null}
            isConnected={Boolean(user)}
            onConnect={handleConnect}
            profileName={user?.name}
            profileImage={user?.picture}
            activeAccountIndex={activeAccountIndex}
            totalAccounts={accounts.length}
            onNavigateToIdeas={() => setActiveTab('ideas')}
          />
        );
      case 'seo':
        return <SEOOptimizer initialTopic={seoVideoTopic} onTopicUsed={() => setSeoVideoTopic('')} />;
      case 'strategy':
        return <ContentStrategy />;
      case 'keywords':
        return <KeywordResearch />;
      case 'script':
        return (
          <ScriptArchitect
            initialTopic={scriptTopic}
            onTopicUsed={() => setScriptTopic('')}
            channelContext={user?.channel || null}
          />
        );
      case 'thumbnail':
        return <ThumbnailConcepting />;
      case 'voiceover':
        return <VoiceOver />;
      case 'clips':
        return <ViralClipExtractor />;
      case 'repurpose':
        return <ContentRepurposer />;
      case 'settings':
        return <SettingsPanel theme={theme} onThemeChange={setTheme} />;
      case 'videos':
        return <VideoList onOptimizeSEO={(videoTitle) => {
          setSeoVideoTopic(videoTitle);
          setActiveTab('seo');
          setIsSidebarOpen(false);
        }} />;
      case 'channel':
        return <ChannelAnalysis />;
      case 'coach':
        return <AICoach 
          channelContext={user?.channel} 
          userProfile={user ? { name: user.name, picture: user.picture } : undefined}
        />;
      case 'ideas':
        return <VideoIdeaGenerator 
          channelContext={user?.channel} 
          onNavigateToScript={(ideaTitle) => {
            setScriptTopic(ideaTitle);
            setActiveTab('script');
            setIsSidebarOpen(false);
          }}
        />;
      case 'competitors':
        return <CompetitorAnalysis />;
      case 'comments':
        return <CommentStrategist />;
      case 'collaborators':
        return <CollaborationEngine />;
      case 'insights':
        return <ChannelInsights />;
      default:
        return (
          <HomeDashboard
            channel={user?.channel || null}
            isConnected={Boolean(user)}
            onConnect={handleConnect}
            profileName={user?.name}
            profileImage={user?.picture}
            activeAccountIndex={activeAccountIndex}
            totalAccounts={accounts.length}
            onNavigateToIdeas={() => setActiveTab('ideas')}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        'theme-root flex h-screen font-sans transition-colors',
        theme === 'light'
          ? 'theme-light bg-slate-100 text-slate-900 selection:bg-slate-300 selection:text-slate-900'
          : 'theme-dark bg-[#050505] text-slate-200 selection:bg-white/20 selection:text-white'
      )}
    >
      <button
        className={cn(
          'lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md border',
          theme === 'light'
            ? 'bg-white border-slate-300 text-slate-700'
            : 'bg-[#0a0a0a] border-white/10'
        )}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:block flex flex-col',
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-[#0a0a0a] border-white/10',
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
                  data-tour-id={tab.id === 'home' ? 'tour-home-tab' : undefined}
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

          <div className="space-y-1" data-tour-id="tour-studios-section">
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

          <div className="space-y-1" data-tour-id="tour-growth-section">
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
                  <div
                    className={cn(
                      'absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto border',
                      theme === 'light'
                        ? 'bg-white border-slate-300 shadow-slate-900/15'
                        : 'bg-[#1a1a1a] border-white/20'
                    )}
                  >
                    {/* Current Active Account Header */}
                    <div
                      className={cn(
                        'p-3 border-b',
                        theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'
                      )}
                    >
                      <p className={cn('text-[10px] uppercase tracking-wider mb-1.5', theme === 'light' ? 'text-slate-500' : 'text-slate-500')}>
                        Active Account
                      </p>
                      <p className={cn('text-xs font-semibold truncate', theme === 'light' ? 'text-slate-900' : 'text-white')}>
                        {user.channel?.title || user.name}
                      </p>
                      <p className={cn('text-[10px] truncate mt-0.5', theme === 'light' ? 'text-slate-600' : 'text-slate-400')}>
                        {user.channel ? `${Number(user.channel.statistics.subscriberCount).toLocaleString()} subscribers` : 'No channel'}
                      </p>
                    </div>
                    
                    {/* All Accounts - for switching */}
                    {accounts.length > 1 && (
                      <div className={cn('border-b', theme === 'light' ? 'border-slate-200' : 'border-white/10')}>
                        <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Switch Account</p>
                        <div className="py-1">
                          {accounts.map((account, index) => (
                            <div key={account.id} className="relative group">
                              <button
                                onClick={() => {
                                  if (index !== activeAccountIndex) {
                                    handleSwitchAccount(index);
                                  }
                                }}
                                disabled={index === activeAccountIndex}
                                className={cn(
                                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                                  index === activeAccountIndex
                                    ? theme === 'light'
                                      ? 'bg-blue-50 text-blue-700 cursor-default'
                                      : 'bg-blue-500/10 text-blue-400 cursor-default'
                                    : theme === 'light'
                                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                )}
                              >
                                <img
                                  src={account.channel?.thumbnails?.default?.url || account.picture}
                                  alt={account.name}
                                  className={cn(
                                    'w-8 h-8 rounded-full border',
                                    theme === 'light' ? 'border-slate-300' : 'border-white/20'
                                  )}
                                  referrerPolicy="no-referrer"
                                />
                                <div className="flex-1 min-w-0 text-left">
                                  <p className="text-xs font-medium truncate">
                                    {account.channel?.title || account.name}
                                  </p>
                                  <p className={cn('text-[10px] truncate', theme === 'light' ? 'text-slate-600' : 'text-slate-400')}>
                                    {account.channel ? `${Number(account.channel.statistics.subscriberCount).toLocaleString()} subs` : 'No channel'}
                                  </p>
                                </div>
                                {index === activeAccountIndex && (
                                  <ShieldCheck size={14} className={theme === 'light' ? 'text-blue-700' : 'text-blue-400'} />
                                )}
                              </button>
                              {index !== activeAccountIndex && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveAccount(index);
                                  }}
                                  className={cn(
                                    'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity',
                                    theme === 'light' ? 'hover:bg-red-100' : 'hover:bg-red-500/20'
                                  )}
                                  title="Remove account"
                                >
                                  <X size={14} className={theme === 'light' ? 'text-red-600' : 'text-red-400'} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="py-1">
                      <button
                        data-tour-id="tour-settings-entry"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setActiveTab('settings');
                          setIsSidebarOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                          theme === 'light'
                            ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <Settings2 size={16} />
                        <span>Settings</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleConnect();
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                          theme === 'light'
                            ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <Users size={16} />
                        <span>Add Another Account</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleLogout();
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                          theme === 'light'
                            ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                            : 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                        )}
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
                data-tour-id="tour-account-entry"
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
              data-tour-id="tour-account-entry"
              onClick={handleConnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors"
            >
              <YouTubeLogoIcon size={18} />
              Connect YouTube
            </button>
          )}
        </div>
      </aside>

      <main className={cn('flex-1 overflow-y-auto transition-colors', theme === 'light' ? 'bg-slate-100' : 'bg-[#050505]')}>
        <div className="max-w-6xl mx-auto p-6 lg:p-10">
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Workspace</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-1">{activeTabConfig.label}</h1>
                <p className="text-sm text-slate-400 mt-2 max-w-3xl">{activeTabConfig.summary}</p>
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

      <OnboardingTour
        isOpen={isOnboardingOpen}
        stepIndex={onboardingStepIndex}
        steps={ONBOARDING_STEPS}
        onNext={handleOnboardingNext}
        onSkip={handleOnboardingSkip}
      />
    </div>
  );
}
