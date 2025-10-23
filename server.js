import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { Boom } from '@hapi/boom';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { customAlphabet } from 'nanoid';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';

// -----------------------------------------------------------------------------
// Environment configuration
// -----------------------------------------------------------------------------
// Pull environment variables up front. Render and other platforms expose values
// via process.env. If a variable is missing, the server will still boot but
// Supabase calls will no‑op and proper error messages will appear in the logs.

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI = process.env.GHL_REDIRECT_URI;
// Allow override of the marketplace auth URL. Fallback to the documented
// chooselocation endpoint if not provided via env vars.
const GHL_AUTH_URL = process.env.GHL_AUTH_URL ||
  'https://marketplace.gohighlevel.com/oauth/chooselocation';

// Create a Supabase client when credentials exist. If either URL or anon key
// are undefined, supabaseClient will remain null and database writes will be
// skipped gracefully.
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Generate short random IDs for new WhatsApp instances. The alphabet mixes
// letters and digits for readability.
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

// Maintain a map of active WhatsApp sessions by instance ID. Each entry holds
// the Baileys socket and auth state; sessions are torn down when deleted.
const sessions = new Map();

// Maintain a map of WebSocket clients listening for QR/status events. The key
// is the instanceId supplied in the URL. When clients disconnect the entry
// automatically disappears.
const socketClients = new Map();

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

/**
 * Assemble the GoHighLevel OAuth URL for the given instance. The state
 * parameter encodes the instanceId so it can be recovered after authorization.
 * @param {string} instanceId
 * @returns {string}
 */
function buildGhlAuthUrl(instanceId) {
  const params = new URLSearchParams({
    client_id: GHL_CLIENT_ID,
    redirect_uri: GHL_REDIRECT_URI,
    state: instanceId
  });
  return `${GHL_AUTH_URL}?${params.toString()}`;
}

/**
 * Persist or update an installation row in Supabase. If the Supabase client
 * isn't configured, the write is skipped and null is returned. Supabase
 * upserts on the primary key `instanceld` by default. Errors are logged and
 * swallowed so callers can continue operation.
 *
 * @param {object} values - Column values to upsert.
 */
async function saveInstallation(values) {
  if (!supabase) {
    console.warn('Supabase is not configured; skipping saveInstallation');
    return null;
  }
  try {
    const { error } = await supabase
      .from('installations')
      .upsert(values, { onConflict: 'instanceld' });
    if (error) throw error;
  } catch (err) {
    console.error('saveInstallation error:', err);
  }
  return null;
}

/**
 * Remove an installation row from Supabase. If Supabase is not configured
 * deletion is skipped. Any errors are logged.
 *
 * @param {string} instanceId
 */
async function removeInstallation(instanceId) {
  if (!supabase) {
    console.warn('Supabase is not configured; skipping removeInstallation');
    return null;
  }
  try {
    const { error } = await supabase
      .from('installations')
      .delete()
      .eq('instanceld', instanceId);
    if (error) throw error;
  } catch (err) {
    console.error('removeInstallation error:', err);
  }
  return null;
}

/**
 * Boot a Baileys WhatsApp client for the given instance. When a QR code is
 * generated it is pushed to any WebSocket client subscribed to the instance.
 * When connected the user's phone number is saved in Supabase and status
 * messages are emitted. Sessions are tracked in the global `sessions` map.
 *
 * @param {string} instanceId
 */
async function bootWhatsApp(instanceId) {
  // Avoid spinning up multiple sockets for the same instance.
  if (sessions.has(instanceId)) return;

  const authDir = (process.env.PUPPETEER_CACHE_DIR || './.data') + `/${instanceId}`;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });
  sessions.set(instanceId, { sock });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { qr, connection } = update;
    const wsClient = socketClients.get(instanceId);
    if (qr && wsClient) {
      // Send raw QR string; client can render via external service or library
      wsClient.send(JSON.stringify({ type: 'qr', data: qr }));
    }
    if (connection === 'open') {
      // Persist phone number when the connection is established
      const userId = sock.user?.id || '';
      const number = userId.split(':')[0] || null;
      saveInstallation({
        instanceld: instanceId,
        phone_number: number,
        updated_at: new Date().toISOString(),
      });
      if (wsClient) {
        wsClient.send(JSON.stringify({ type: 'status', data: 'connected' }));
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Express application setup
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// Create a new instance. Persist a placeholder row in the database and
// respond with the instanceId and constructed GoHighLevel OAuth URL.
app.post('/api/instances', async (req, res) => {
  try {
    const name = (req.body && req.body.name) || 'Instância';
    const instanceId = nanoid();
    await saveInstallation({
      instanceld: instanceId,
      instance_name: name,
      instance_id: instanceId,
      phone_number: null,
      company_id: null,
      access_token: null,
      refresh_token: null,
      updated_at: new Date().toISOString(),
    });
    const authUrl = buildGhlAuthUrl(instanceId);
    res.json({ instanceId, authUrl });
  } catch (err) {
    console.error('POST /api/instances error:', err);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

// List all saved instances. Rows are sorted descending by last updated.
app.get('/api/instances', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ data: [] });
    }
    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('GET /api/instances error:', err);
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

// Delete a specific instance. Tears down the WhatsApp session (if any) and
// removes the database row.
app.delete('/api/instances/:id', async (req, res) => {
  try {
    const instanceId = req.params.id;
    // End WhatsApp session if running
    if (sessions.has(instanceId)) {
      const { sock } = sessions.get(instanceId);
      try { await sock.logout(); } catch { /* ignore */ }
      sessions.delete(instanceId);
    }
    await removeInstallation(instanceId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/instances error:', err);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// OAuth callback handler. Exchanges the authorization code for tokens, stores
// them in Supabase, boots a WhatsApp session and redirects back to the front.
app.get('/leadconnectorhq/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }
    const instanceId = state;
    // Exchange code for tokens via LeadConnector
    const tokenResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        code,
        redirect_uri: GHL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      throw new Error(`GHL token exchange failed: ${tokenResp.status} ${text}`);
    }
    const token = await tokenResp.json();
    // Persist tokens and company/location ID if available
    await saveInstallation({
      instanceld: instanceId,
      access_token: token.access_token || null,
      refresh_token: token.refresh_token || null,
      company_id: token.location_id || token.company_id || null,
      updated_at: new Date().toISOString(),
    });
    // Boot WhatsApp session; don't await so redirect happens quickly
    bootWhatsApp(instanceId).catch((err) => console.error('bootWhatsApp error', err));
    // Redirect back to the frontend. Trim trailing slash off FRONTEND_URL if present.
    const base = FRONTEND_URL.replace(/\/$/, '');
    return res.redirect(`${base}/instance/${instanceId}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.status(500).send('Internal server error');
  }
});

// -----------------------------------------------------------------------------
// WebSocket server
// -----------------------------------------------------------------------------
// Attach a WebSocket server to the same HTTP server used by Express. Clients
// connect on /ws/<instanceId> and receive QR and status messages for that
// instance. The underlying ws library doesn't integrate with Express directly
// so we manually handle upgrades.
const httpServer = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  // The URL might contain query strings; extract the pathname to find
  // the instanceId. For example: /ws/abc123
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/');
  if (parts.length === 3 && parts[1] === 'ws') {
    const instanceId = parts[2];
    wss.handleUpgrade(req, socket, head, (ws) => {
      socketClients.set(instanceId, ws);
      ws.on('close', () => {
        socketClients.delete(instanceId);
      });
    });
  } else {
    socket.destroy();
  }
});