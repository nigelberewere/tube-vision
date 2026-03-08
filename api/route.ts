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

      const newUserData = {
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

      // Get existing accounts from cookie
      const cookies = req.headers.cookie || '';
      const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
      let accounts: any[] = [];
      
      if (accountsCookie) {
        try {
          accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
        } catch (e) {
          accounts = [];
        }
      }

      // Remove existing account with same ID if it exists (update instead of duplicate)
      accounts = accounts.filter(acc => acc.id !== newUserData.id);
      
      // Add new account at the beginning (makes it active)
      accounts.unshift(newUserData);

      // Store all accounts and set the active account index
      const cookieValue = encodeURIComponent(JSON.stringify(accounts));
      const cookieOptions = 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=' + (30 * 24 * 60 * 60); // 30 days
      
      res.setHeader('Set-Cookie', [
        `tube_vision_accounts=${cookieValue}; ${cookieOptions}`,
        `tube_vision_active=0; ${cookieOptions}` // Active account is index 0
      ]);

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
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    const activeCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_active='));
    
    if (!accountsCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      const activeIndex = activeCookie ? parseInt(activeCookie.split('=')[1]) : 0;
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }
      
      const { tokens, ...safeUser } = userData;
      return res.json(safeUser);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  // Get all accounts
  if (path === 'api/user/accounts') {
    const cookies = req.headers.cookie || '';
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    const activeCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_active='));
    
    if (!accountsCookie) {
      return res.json({ accounts: [], activeIndex: 0 });
    }

    try {
      const accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      const activeIndex = activeCookie ? parseInt(activeCookie.split('=')[1]) : 0;
      
      // Send accounts without tokens for security
      const safeAccounts = accounts.map((acc: any) => {
        const { tokens, ...safe } = acc;
        return safe;
      });
      
      return res.json({ accounts: safeAccounts, activeIndex });
    } catch (error) {
      return res.json({ accounts: [], activeIndex: 0 });
    }
  }

  // Switch active account
  if (path === 'api/user/switch' && req.method === 'POST') {
    const cookies = req.headers.cookie || '';
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    
    if (!accountsCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const body = req.body || {};
      const newIndex = body.index;
      
      if (typeof newIndex !== 'number') {
        return res.status(400).json({ error: 'Invalid index' });
      }

      const accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      
      if (newIndex < 0 || newIndex >= accounts.length) {
        return res.status(400).json({ error: 'Index out of range' });
      }

      const cookieOptions = 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=' + (30 * 24 * 60 * 60);
      res.setHeader('Set-Cookie', `tube_vision_active=${newIndex}; ${cookieOptions}`);
      
      return res.json({ success: true, activeIndex: newIndex });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to switch account' });
    }
  }

  // Remove an account
  if (path === 'api/user/remove' && req.method === 'POST') {
    const cookies = req.headers.cookie || '';
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    const activeCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_active='));
    
    if (!accountsCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const body = req.body || {};
      const removeIndex = body.index;
      
      if (typeof removeIndex !== 'number') {
        return res.status(400).json({ error: 'Invalid index' });
      }

      let accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      let activeIndex = activeCookie ? parseInt(activeCookie.split('=')[1]) : 0;
      
      if (removeIndex < 0 || removeIndex >= accounts.length) {
        return res.status(400).json({ error: 'Index out of range' });
      }

      // Remove the account
      accounts.splice(removeIndex, 1);

      // Adjust active index if necessary
      if (activeIndex >= accounts.length) {
        activeIndex = Math.max(0, accounts.length - 1);
      } else if (activeIndex > removeIndex) {
        activeIndex--;
      }

      const cookieOptions = 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=' + (30 * 24 * 60 * 60);
      
      if (accounts.length === 0) {
        // Clear cookies if no accounts left
        res.setHeader('Set-Cookie', [
          'tube_vision_accounts=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0',
          'tube_vision_active=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
        ]);
      } else {
        const cookieValue = encodeURIComponent(JSON.stringify(accounts));
        res.setHeader('Set-Cookie', [
          `tube_vision_accounts=${cookieValue}; ${cookieOptions}`,
          `tube_vision_active=${activeIndex}; ${cookieOptions}`
        ]);
      }
      
      return res.json({ success: true, activeIndex });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to remove account' });
    }
  }

  // Get user videos
  if (path === 'api/user/videos') {
    const cookies = req.headers.cookie || '';
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    const activeCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_active='));
    
    if (!accountsCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      const activeIndex = activeCookie ? parseInt(activeCookie.split('=')[1]) : 0;
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }
      
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
    const accountsCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_accounts='));
    const activeCookie = cookies.split('; ').find(c => c.startsWith('tube_vision_active='));
    
    if (!accountsCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const accounts = JSON.parse(decodeURIComponent(accountsCookie.split('=')[1]));
      const activeIndex = activeCookie ? parseInt(activeCookie.split('=')[1]) : 0;
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }
      
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const authHeader = { Authorization: `Bearer ${userData.tokens.access_token}` };

      // Fetch daily analytics (always works)
      const reportsResponse = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,subscribersGained,subscribersLost,estimatedMinutesWatched&dimensions=day&sort=day`,
        { headers: authHeader }
      );
      const reportsData = await reportsResponse.json();

      if (reportsData.error) {
        console.error('YouTube Analytics API error:', reportsData.error);
        return res.status(403).json({
          error: reportsData.error.message || 'YouTube Analytics API error',
          code: reportsData.error.code,
          details: reportsData.error,
        });
      }

      // Try to fetch hourly data (may not be available for all channels)
      let hourlyData = { rows: [] };
      let todayHourlyData = { rows: [] };
      let yesterdayHourlyData = { rows: [] };

      try {
        const [hourlyResponse, todayHourlyResponse, yesterdayHourlyResponse] = await Promise.all([
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${endDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${yesterdayDate}&endDate=${yesterdayDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
        ]);

        const hourlyJson = await hourlyResponse.json();
        const todayHourlyJson = await todayHourlyResponse.json();
        const yesterdayHourlyJson = await yesterdayHourlyResponse.json();

        // Only use hourly data if no errors
        if (!hourlyJson.error) hourlyData = hourlyJson;
        if (!todayHourlyJson.error) todayHourlyData = todayHourlyJson;
        if (!yesterdayHourlyJson.error) yesterdayHourlyData = yesterdayHourlyJson;
      } catch (hourlyError) {
        console.log('Hourly analytics not available, continuing with daily data only');
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
    res.setHeader('Set-Cookie', [
      'tube_vision_accounts=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0',
      'tube_vision_active=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
    ]);
    return res.json({ success: true });
  }

  // Default response for unknown paths
  return res.status(404).json({ error: 'Not found', path });
}
