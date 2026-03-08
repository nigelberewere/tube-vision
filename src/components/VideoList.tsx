import { useState, useEffect } from 'react';
import { 
  Play, 
  Eye, 
  ThumbsUp, 
  MessageSquare, 
  Clock, 
  Loader2, 
  ExternalLink,
  Search,
  Filter,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ShimmerVideoCard } from './Shimmer';

interface VideoListProps {
  onOptimizeSEO?: (videoTitle: string) => void;
}

interface Video {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      medium: { url: string };
      high: { url: string };
    };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  contentDetails: {
    duration: string;
  };
}

export default function VideoList({ onOptimizeSEO }: VideoListProps = {}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchVideos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/user/videos');
      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      } else if (response.status === 401) {
        setError("Please connect your YouTube account to view your videos.");
      } else {
        setError("Failed to fetch your videos.");
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const filteredVideos = videos.filter(v => 
    v.snippet.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (pt: string) => {
    // Basic ISO 8601 duration parser (e.g., PT5M30S -> 5:30)
    const match = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return pt;
    const [, h, m, s] = match;
    const parts = [];
    if (h) parts.push(h);
    parts.push(m ? m.padStart(h ? 2 : 1, '0') : '0');
    parts.push(s ? s.padStart(2, '0') : '00');
    return parts.join(':');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-zinc-800/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ShimmerVideoCard />
          <ShimmerVideoCard />
          <ShimmerVideoCard />
          <ShimmerVideoCard />
          <ShimmerVideoCard />
          <ShimmerVideoCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Error Loading Videos</h2>
        <p className="text-zinc-400 mb-6">{error}</p>
        <button 
          onClick={fetchVideos}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">My Videos</h1>
          <p className="text-zinc-400 mt-2">Manage and analyze your recent uploads.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Play size={32} className="text-zinc-500" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100">No videos found</h3>
          <p className="text-zinc-400 max-w-md mx-auto">
            {searchQuery ? "No videos match your search criteria." : "You haven't uploaded any videos yet or your channel is empty."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map((video) => (
            <div 
              key={video.id} 
              className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-500/5"
            >
              <div className="relative aspect-video">
                <img 
                  src={video.snippet.thumbnails.high.url} 
                  alt={video.snippet.title} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                  {formatDuration(video.contentDetails.duration)}
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a 
                    href={`https://youtube.com/watch?v=${video.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-3 bg-white rounded-full text-black hover:scale-110 transition-transform"
                  >
                    <Play fill="currentColor" size={24} />
                  </a>
                </div>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-bold text-zinc-100 line-clamp-2 text-sm group-hover:text-indigo-400 transition-colors">
                    {video.snippet.title}
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(video.snippet.publishedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                      <Eye size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Views</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-200">{Number(video.statistics.viewCount).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                      <ThumbsUp size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Likes</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-200">{Number(video.statistics.likeCount).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                      <MessageSquare size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Comments</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-200">{Number(video.statistics.commentCount).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => onOptimizeSEO?.(video.snippet.title)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
                  >
                    <Sparkles size={12} />
                    Optimize SEO
                  </button>
                  <a 
                    href={`https://youtube.com/watch?v=${video.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
