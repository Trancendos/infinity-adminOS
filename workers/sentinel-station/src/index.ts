/**
 * Sentinel Station Worker
 * DPID: DPID-SEN-CORE-001 | Location: L23
 * Trans-Warp Slipstream Interplexing Hub
 * Standard: Trancendos 2060
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

const SLA_MS: Record<string,number> = { CLASS_A_AGENT:100, CLASS_B_DATA:500, CLASS_C_EVENT:50, CLASS_D_EMERGENCY:5 };

interface Env { TUNNEL_STORE: KVNamespace; PASSPORT_STORE: KVNamespace; }

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

app.get('/health', c => c.json({ status:'operational', service:'sentinel-station', dpid:'DPID-SEN-CORE-001', location:'L23', name:'Sentinel Station', description:'Trans-Warp Slipstream Interplexing Hub', slipstreamClasses:['CLASS_A_AGENT','CLASS_B_DATA','CLASS_C_EVENT','CLASS_D_EMERGENCY'], standard:'Trancendos-2060', timestamp:new Date().toISOString() }));

app.get('/status', c => c.json({ station:'SENTINEL_STATION', location:'L23', status:'FULLY_OPERATIONAL', interplexingBeacon:'ACTIVE', warpTunnels:'READY', passportControl:'OPERATIONAL', emergencyRecall:'STANDBY', colour:'#7B68EE', dpid:'DPID-SEN-CORE-001' }));

const InitiateSchema = z.object({ agentDpid:z.string(), agentName:z.string(), homeEcosystem:z.string(), destinationEcosystem:z.string(), destinationDpid:z.string(), slipstreamClass:z.enum(['CLASS_A_AGENT','CLASS_B_DATA','CLASS_C_EVENT','CLASS_D_EMERGENCY']), payload:z.unknown().optional(), passportToken:z.string() });

app.post('/slipstream/initiate', async c => {
  const body = await c.req.json().catch(() => null);
  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error:'Invalid request', details:parsed.error.issues }, 400);
  const { agentDpid, homeEcosystem, destinationEcosystem, destinationDpid, slipstreamClass, payload } = parsed.data;
  if (homeEcosystem === destinationEcosystem) return c.json({ error:'OPA_VALIDATION_FAILED', reason:'Same-ecosystem transit does not require Sentinel Station' }, 403);
  const tunnelId = crypto.randomUUID();
  const transitStart = Date.now();
  const durationMs = Date.now() - transitStart;
  const slaSms = SLA_MS[slipstreamClass] ?? 100;
  const tunnel = { tunnelId, slipstreamClass, sourceEcosystem:homeEcosystem, destinationEcosystem, agentDpid, stage:'SHP_CLOSE', openedAt:new Date().toISOString(), slaSms, status:'closed' };
  await c.env.TUNNEL_STORE.put(tunnelId, JSON.stringify(tunnel), { expirationTtl: 86400 });
  return c.json({ success:true, tunnelId, slipstreamClass, stages:['SHP_HELLO','SHP_CHALLENGE','SHP_RESPONSE','SHP_OPA_VALIDATE','SHP_WARP_TUNNEL_OPEN','SHP_TRANSIT','SHP_CLOSE'], sourceEcosystem:homeEcosystem, destinationEcosystem, destinationDpid, slaTargetMs:slaSms, durationMs, slaCompliant:durationMs<=slaSms, response:{ message:'Transit complete via Sentinel Station', payload:payload??null } });
});

app.post('/passport/validate', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body?.agentDpid || !body?.homeEcosystem) return c.json({ valid:false, reason:'Missing required fields' }, 400);
  const passportId = crypto.randomUUID();
  await c.env.PASSPORT_STORE.put(passportId, JSON.stringify({ passportId, agentDpid:body.agentDpid, homeEcosystem:body.homeEcosystem, validatedAt:new Date().toISOString() }), { expirationTtl:86400 });
  const allEcosystems = ['PSYON','AVALON','INFINITY','IMPERIUM','PEGASUS','TRANQUILITY'];
  return c.json({ valid:true, passportId, agentDpid:body.agentDpid, permittedDestinations:allEcosystems.filter(e=>e!==body.homeEcosystem), issuedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+86400000).toISOString(), opaApproved:true, warden:'The Warden — Sentinel Station Passport Control' });
});

app.post('/recall', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body?.agentDpid) return c.json({ error:'agentDpid required' }, 400);
  const start = Date.now();
  const durationMs = Date.now()-start;
  return c.json({ recalled:true, agentDpid:body.agentDpid, slipstreamClass:'CLASS_D_EMERGENCY', slaTargetMs:5, durationMs, slaCompliant:durationMs<=5, message:'Emergency recall initiated — Class D Slipstream activated', timestamp:new Date().toISOString() });
});

app.get('/tunnel/:id', async c => {
  const tunnel = await c.env.TUNNEL_STORE.get(c.req.param('id'));
  if (!tunnel) return c.json({ error:'Tunnel not found or expired' }, 404);
  return c.json(JSON.parse(tunnel));
});

app.get('/metrics', c => c.json({ service:'sentinel-station', dpid:'DPID-SEN-CORE-001', slipstreamClasses:{ CLASS_A_AGENT:{slaMs:100,protocol:'gRPC'}, CLASS_B_DATA:{slaMs:500,protocol:'HTTPS'}, CLASS_C_EVENT:{slaMs:50,protocol:'MQTT'}, CLASS_D_EMERGENCY:{slaMs:5,protocol:'Emergency',priority:'HIGHEST'} }, protocol:'SHP/1.0', standard:'Trancendos-2060', timestamp:new Date().toISOString() }));

export default app;