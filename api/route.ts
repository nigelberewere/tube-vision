import type { VercelRequest, VercelResponse } from '@vercel/node';
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/auth/google/callback`;

function isMissingConfigValue(value?: string): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('your_google_client') ||
    normalized.includes('placeholder') ||
    normalized.includes('changeme')
  );
}

const OAUTH_MISSING_VARS = [
  ['GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID],
  ['GOOGLE_CLIENT_SECRET', GOOGLE_CLIENT_SECRET],
]
  .filter(([, value]) => isMissingConfigValue(value as string))
  .map(([name]) => name);

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path || '';

  // Config endpoint
  if (path === 'api/auth/config') {
    return res.json({
      appUrl: APP_URL,
      redirectUri: REDIRECT_URI,
      nodeEnv: process.env.NODE_ENV || 'development',
      hasClientId: Boolean(GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(GOOGLE_CLIENT_SECRET),
      missingVars: OAUTH_MISSING_VARS,
    });
  }

  // OAuth URL generator
  if (path === 'api/auth/google/url') {
    console.log(`[Auth URL Request] REDIRECT_URI: ${REDIRECT_URI}`);

    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(', ')}`);
      return res.status(500).json({
        error: 'Google OAuth credentials not configured',
        missingEnv: OAUTH_MISSING_VARS,
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(REDIRECT_URI)}`);
    return res.json({ url });
  }

  // OAuth callback
  if (path === 'auth/google/callback' || path === 'api/auth/google/callback') {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      // Fetch user profile and channel info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const youtubeResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      const youtubeData = await youtubeResponse.json();
      const channel = youtubeData.items?.[0];

      // Store user data in a cookie (simplified - in production use proper session management)
      const userData = {
        id: userInfo.id,
        name: userInfo.name,
        picture: userInfo.picture,
        tokens: tokens,
        channel: channel
          ? {
              id: channel.id,
              title: channel.snippet.title,
              description: channel.snippet.description,
              thumbnails: channel.snippet.thumbnails,
              statistics: channel.statistics,
            }
          : null,
      };

      // Set cookie with user data (encrypted/signed in production)
      res.setHeader('Set-Cookie', `tube_vision_user=${encodeURIComponent(JSON.stringify(userData))}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${24 * 60 * 60}`);

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Authentication Successful</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                font-family: system-ui, -apple-system, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
              }
              .container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 32px;
                backdrop-filter: blur(10px);
              }
              h1 { margin: 0 0 12px 0; font-size: 24px; }
              p { margin: 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✓ Authentication Successful</h1>
              <p>Closing this window...</p>
            </div>
            <script>
              (function() {
                function closeWindow() {
                  if (window.opener) {
                    try {
                      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
                    } catch (e) {
                      console.error('Failed to post message:', e);
                    }
                    window.close();
                    setTimeout(function() { window.close(); }, 100);
                    setTimeout(function() {
                      if (!window.closed) {
                        window.location.href = '/';
                      }
                    }, 1000);
                  } else {
                    window.location.href = '/';
                  }
                }
                closeWindow();
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', closeWindow);
                }
              })();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth error:', error);
      return res.status(500).send('Authentication failed');
    }
  }

  // Get user channel data
  if (path === 'api/user/channel') {
    const cookies = req.headers.cookie || '';
    const userCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_user='));
    
    if (!userCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = JSON.parse(decodeURIComponent(userCookie.split('=')[1]));
      const { tokens, ...safeUser } = userData;
      return res.json(safeUser);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  // Get user videos
  if (path === 'api/user/videos') {
    const cookies = req.headers.cookie || '';
    const userCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_user='));
    
    if (!userCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = JSON.parse(decodeURIComponent(userCookie.split('=')[1]));
      
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date',
        {
          headers: { Authorization: `Bearer ${userData.tokens.access_token}` },
        }
      );
      const data = await response.json();
      
      // Fetch detailed statistics for each video
      const videoIds = data.items?.map((item: any) => item.id.videoId).join(',');
      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
          {
            headers: { Authorization: `Bearer ${userData.tokens.access_token}` },
          }
        );
        const statsData = await statsResponse.json();
        return res.json(statsData.items);
      }
      
      return res.json([]);
    } catch (error) {
      console.error('Fetch videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch videos' });
    }
  }

  // Get user analytics
  if (path === 'api/user/analytics') {
    const cookies = req.headers.cookie || '';
    const userCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_user='));
    
    if (!userCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = JSON.parse(decodeURIComponent(userCookie.split('=')[1]));
      
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const authHeader = { Authorization: `Bearer ${userData.tokens.access_token}` };

      const [reportsResponse, hourlyResponse, todayHourlyResponse, yesterdayHourlyResponse] = await Promise.all([
        fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,subscribersGained,subscribersLost,estimatedMinutesWatched&dimensions=day&sort=day`,
          { headers: authHeader }
        ),
        fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views&dimensions=hourOfDay&sort=hourOfDay`,
          { headers: authHeader }
        ),
        fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${endDate}&endDate=${endDate}&metrics=views&dimensions=hourOfDay&sort=hourOfDay`,
          { headers: authHeader }
        ),
        fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${yesterdayDate}&endDate=${yesterdayDate}&metrics=views&dimensions=hourOfDay&sort=hourOfDay`,
          { headers: authHeader }
        ),
      ]);

      const reportsData = await reportsResponse.json();
      const hourlyData = await hourlyResponse.json();
      const todayHourlyData = await todayHourlyResponse.json();
      const yesterdayHourlyData = await yesterdayHourlyResponse.json();

      // Check if any response contains an error
      const apiError = reportsData.error || hourlyData.error || todayHourlyData.error || yesterdayHourlyData.error;
      if (apiError) {
        console.error('YouTube Analytics API error:', apiError);
        return res.status(403).json({
          error: apiError.message || 'YouTube Analytics API error',
          code: apiError.code,
          details: apiError,
        });
      }

      return res.json({
        daily: reportsData,
        hourly: hourlyData,
        todayHourly: todayHourlyData,
        yesterdayHourly: yesterdayHourlyData,
      });
    } catch (error) {
      console.error('Fetch analytics error:', error);
      return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  // Logout
  if (path === 'api/auth/logout') {
    res.setHeader('Set-Cookie', 'tube_vision_user=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
    return res.json({ success: true });
  }

  // Default response for unknown paths
  return res.status(404).json({ error: 'Not found', path });
}
