import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  let cachedSpotifyToken: { accessToken: string; expiresAt: number } | null = null;

  const handleSpotifyTokenRequest = async (req: Request, res: Response) => {
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || '';
    const bodyClientId =
      typeof req.body === 'object' && req.body !== null && 'clientId' in req.body
        ? String((req.body as { clientId?: unknown }).clientId ?? '').trim()
        : '';
    const queryClientId =
      typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
    const clientId =
      bodyClientId ||
      queryClientId ||
      process.env.VITE_SPOTIFY_CLIENT_ID?.trim() ||
      process.env.SPOTIFY_CLIENT_ID?.trim() ||
      '';

    if (
      !clientId ||
      !clientSecret ||
      clientId === 'MY_SPOTIFY_CLIENT_ID' ||
      clientSecret === 'MY_SPOTIFY_CLIENT_SECRET'
    ) {
      res.json({ available: false, accessToken: null });
      return;
    }

    const now = Date.now();
    if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > now + 60_000) {
      res.json({
        available: true,
        accessToken: cachedSpotifyToken.accessToken,
        expiresAt: cachedSpotifyToken.expiresAt,
        tokenType: 'Bearer',
      });
      return;
    }

    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!tokenRes.ok) {
        res.json({ available: false, accessToken: null, reason: `spotify_http_${tokenRes.status}` });
        return;
      }

      const payload = (await tokenRes.json()) as {
        access_token?: string;
        expires_in?: number;
        token_type?: string;
      };

      if (!payload.access_token) {
        res.json({ available: false, accessToken: null });
        return;
      }

      const expiresInMs = Math.max(60, Number(payload.expires_in) || 3600) * 1000;
      const expiresAt = now + expiresInMs;
      cachedSpotifyToken = { accessToken: payload.access_token, expiresAt };

      res.json({
        available: true,
        accessToken: payload.access_token,
        expiresAt,
        tokenType: payload.token_type || 'Bearer',
      });
    } catch {
      res.json({ available: false, accessToken: null, reason: 'spotify_network_error' });
    }
  };

  app.get('/api/spotify/token', handleSpotifyTokenRequest);
  app.post('/api/spotify/token', handleSpotifyTokenRequest);

  app.post('/api/gemini/wrapped', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    const body = (req.body ?? {}) as {
      topArtists?: Array<{ name: string; plays: number; minutes: number }>;
      topSongs?: Array<{ title: string; artist: string; plays: number }>;
      favoriteGenres?: string[];
      totalMinutes?: number;
      period?: string;
    };

    const topArtists = Array.isArray(body.topArtists) ? body.topArtists.slice(0, 5) : [];
    const topSongs = Array.isArray(body.topSongs) ? body.topSongs.slice(0, 5) : [];
    const genres = Array.isArray(body.favoriteGenres) ? body.favoriteGenres.slice(0, 5) : [];
    const totalMinutes = Number(body.totalMinutes) || 0;
    const period = typeof body.period === 'string' ? body.period : 'This Week';

    const localFallback = {
      headline: topArtists[0]
        ? `${topArtists[0].name} Era`
        : genres[0]
          ? `${genres[0]} Frequency`
          : 'Your Soundscape',
      persona: genres.length > 0 ? `${genres[0]} Architect` : 'Late-Night Curator',
      summary:
        topSongs[0] && topArtists[0]
          ? `${totalMinutes} minutes across ${period.toLowerCase()}, led by ${topArtists[0].name} and "${topSongs[0].title}".`
          : 'Play songs across your library to shape your live KLYN Wrapped narrative.',
      vibeTags: genres.slice(0, 3).length > 0 ? genres.slice(0, 3) : ['Spatial', 'Late Night', 'Pure'],
      source: 'local',
    };

    if (!ai) {
      res.json(localFallback);
      return;
    }

    try {
      const prompt = [
        'Return strictly valid JSON with keys: headline (max 4 words), persona (max 3 words), summary (1 crisp sentence max 24 words), vibeTags (array of 3 short strings).',
        `Listener stats for ${period}:`,
        `Total minutes: ${totalMinutes}`,
        `Favorite genres: ${genres.join(', ') || 'Eclectic'}`,
        `Top artists: ${topArtists.map((a) => `${a.name} (${a.plays} plays)`).join(', ') || 'None yet'}`,
        `Top songs: ${topSongs.map((s) => `${s.title} by ${s.artist}`).join(', ') || 'None yet'}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text) as {
          headline?: string;
          persona?: string;
          summary?: string;
          vibeTags?: string[];
        };
        res.json({
          headline: parsed.headline || localFallback.headline,
          persona: parsed.persona || localFallback.persona,
          summary: parsed.summary || localFallback.summary,
          vibeTags: Array.isArray(parsed.vibeTags) && parsed.vibeTags.length > 0
            ? parsed.vibeTags.slice(0, 3)
            : localFallback.vibeTags,
          source: 'gemini',
        });
        return;
      }
    } catch {
      // Graceful fallback to local statistical summary
    }

    res.json(localFallback);
  });

  app.post('/api/gemini/recommendations', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    const body = (req.body ?? {}) as {
      favoriteGenres?: string[];
      recentArtists?: string[];
      moodHint?: string;
    };

    const genres = Array.isArray(body.favoriteGenres) ? body.favoriteGenres.slice(0, 5) : ['Trap', 'R&B', 'Pop'];
    const recentArtists = Array.isArray(body.recentArtists) ? body.recentArtists.slice(0, 5) : [];

    const fallbackQueries = [
      ...recentArtists.slice(0, 2).map((a) => `${a}`),
      ...genres.slice(0, 3).map((g) => `${g} new music`),
    ].slice(0, 5);

    if (!ai) {
      res.json({ queries: fallbackQueries, source: 'local' });
      return;
    }

    try {
      const prompt = [
        'Return strictly valid JSON: {"queries": ["query1", "query2", "query3", "query4", "query5"]}.',
        'Generate 5 diverse real artist or song search queries tailored to these preferences.',
        `Genres: ${genres.join(', ')}`,
        `Recent artists: ${recentArtists.join(', ') || 'None'}`,
        body.moodHint ? `Mood: ${body.moodHint}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text) as { queries?: string[] };
        if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
          res.json({ queries: parsed.queries.slice(0, 5), source: 'gemini' });
          return;
        }
      }
    } catch {
      // Fallback safely
    }

    res.json({ queries: fallbackQueries, source: 'local' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KLYN server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
