import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const logger = pino({ transport: { target: 'pino-pretty' } });
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || true, credentials: true }));
app.use(express.json());
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const socketsByInstance = new Map();
const sessions = new Map();
function broadcast(instanceId, payload){ const set = socketsByInstance.get(instanceId); if(!set) return; for(const ws of set){ try{ ws.send(JSON.stringify(payload)); }catch{}}}
function buildGhlAuthUrl(state){
  const base = "https://marketplace.gohighlevel.com/oauth/chooselocation";
  const p = new URLSearchParams({ response_type:'code', client_id:process.env.GHL_CLIENT_ID, redirect_uri:process.env.GHL_REDIRECT_URI, state });
  return `${base}?${p.toString()}`;
}
async function saveInstallation(row){ const { data, error } = await supabase.from('installations').upsert(row, { onConflict:'instanceld' }); if(error) throw error; return data?.[0] || row; }
async function bootWhatsApp(instanceId){
  const authDir = path.join('.data', instanceId); fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({ auth: state, printQRInTerminal:false });
  sessions.set(instanceId, { sock, stop: async () => { try{ await sock.logout(); }catch{} } });
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if(qr){ const dataUrl = await QRCode.toDataURL(qr); broadcast(instanceId, { type:'qr', data:dataUrl }); broadcast(instanceId, { type:'status', data:'SCAN_QR' }); }
    if(connection==='open'){ broadcast(instanceId, { type:'status', data:'CONNECTED' }); try{ const me = sock?.user; const phone = me?.id?.split(':')[0]; await saveInstallation({ instanceld: instanceId, phone_number: phone, updated_at: new Date().toISOString() }); }catch{} }
    if(connection==='close'){ const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut); broadcast(instanceId, { type:'status', data:'DISCONNECTED' }); if(shouldReconnect) setTimeout(()=>bootWhatsApp(instanceId).catch(()=>{}), 2000); }
  });
  sock.ev.on('creds.update', saveCreds);
}

app.post('/api/instances', async (req,res)=>{
  try{
    const instanceId = uuidv4(); const { instance_name } = req.body || {}; const state = instanceId;
    await saveInstallation({ instanceld: instanceId, instance_name: instance_name || instanceId, updated_at: new Date().toISOString() });
    const authUrl = buildGhlAuthUrl(state); res.json({ ok:true, instanceId, authUrl });
  }catch(e){ logger.error(e); res.status(500).json({ ok:false, error:'failed_to_create_instance' }); }
});
app.get('/api/instances', async (_req,res)=>{
  const { data, error } = await supabase.from('installations').select('*').order('updated_at', { ascending:false });
  if(error) return res.status(500).json({ ok:false, error:error.message }); res.json({ ok:true, data });
});
app.delete('/api/instances/:id', async (req,res)=>{
  const id = req.params.id; try{ const s = sessions.get(id); if(s){ await s.stop(); sessions.delete(id); } await supabase.from('installations').delete().eq('instanceld', id); const authDir = path.join('.data', id); try{ fs.rmSync(authDir, { recursive:true, force:true }); }catch{} res.json({ ok:true }); }catch(e){ logger.error(e); res.status(500).json({ ok:false, error:'failed_to_delete' }); }
});
app.get('/leadconnectorhq/oauth/callback', async (req, res) => {
  const { code, state, companyId } = req.query; if (!code || !state) return res.status(400).send('Missing code/state'); const instanceId = state;
  try{
    const tokenRes = await fetch('https://services.leadconnectorhq.com/oauth/token', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ client_id:process.env.GHL_CLIENT_ID, client_secret:process.env.GHL_CLIENT_SECRET, grant_type:'authorization_code', code, redirect_uri:process.env.GHL_REDIRECT_URI })});
    const tokenJson = await tokenRes.json(); if(!tokenRes.ok) throw new Error('GHL token error: '+JSON.stringify(tokenJson));
    await saveInstallation({ instanceld: instanceId, access_token: tokenJson.access_token, refresh_token: tokenJson.refresh_token, company_id: companyId || null, updated_at: new Date().toISOString() });
    bootWhatsApp(instanceId).catch(err=>logger.error(err)); const url = new URL(process.env.FRONTEND_URL); url.pathname = '/instance/'+instanceId; res.redirect(url.toString());
  }catch(e){ logger.error(e); res.status(500).send('OAuth failed'); }
});
const server = app.listen(process.env.PORT || 10000, () => { console.log('API listening'); });
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const match = request.url.match(/^\/ws\/(.+)$/); if(!match){ socket.destroy(); return; }
  const instanceId = match[1]; wss.handleUpgrade(request, socket, head, (ws)=>{
    if(!socketsByInstance.has(instanceId)) socketsByInstance.set(instanceId, new Set());
    socketsByInstance.get(instanceId).add(ws);
    ws.on('close', ()=> socketsByInstance.get(instanceId)?.delete(ws));
    ws.send(JSON.stringify({ type:'status', data:'READY_TO_LINK' }));
  });
});
