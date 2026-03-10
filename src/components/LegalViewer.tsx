import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, FileText } from 'lucide-react';

interface LegalViewerProps {
  type: 'terms' | 'privacy';
  onBack?: () => void;
}

export function LegalViewer({ type, onBack }: LegalViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = type === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  const filename = type === 'terms' ? 'terms-of-service.md' : 'privacy-policy.md';

  useEffect(() => {
    fetch(`/${filename}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load document');
        return res.text();
      })
      .then(setContent)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filename]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading {title}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
          <div className="text-red-500 font-medium mb-2">Error</div>
          <p className="text-gray-300 mb-4">{error}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Go Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-xl p-6 mb-6 border border-gray-700/50">
          <div className="flex items-center gap-4 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
            )}
            <div className="p-3 bg-purple-500/10 rounded-full">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">{title}</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Please read these terms carefully before using VidVision.
          </p>
        </div>

        {/* Content */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-xl p-8 border border-gray-700/50">
          <div className="prose prose-invert prose-purple max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold text-white mt-8 mb-4 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-2xl font-semibold text-white mt-6 mb-3">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xl font-medium text-white mt-4 mb-2">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-2">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="ml-4">{children}</li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-purple-400 hover:text-purple-300 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-white">
                    {children}
                  </strong>
                ),
                code: ({ children }) => (
                  <code className="bg-gray-900 text-purple-300 px-1.5 py-0.5 rounded text-sm">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg overflow-x-auto mb-4">
                    {children}
                  </pre>
                ),
                hr: () => (
                  <hr className="border-gray-700 my-8" />
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-purple-500 pl-4 italic text-gray-400 my-4">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LegalViewer;
