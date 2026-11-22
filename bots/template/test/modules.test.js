// Each client gets only the modules they bought: a module that's off says, sends and offers nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { handleOwner, scheduled } from '../src/owner.js';
import { toolsFor, runTool, TOOLS } from '../src/tools.js';
import { buildSystemPrompt } from '../src/prompt.js';
import { handleMissedCall } from '../src/missedcall.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from './fixture.js';
import { saveConv } from '../src/store.js';
import { MODULE_NAMES, moduleOn } from '../src/logic.js';
import { fakeEnv, scriptedClient, say } from './helpers.js';

const OWNER = '972500000001';
const agency = { ...AGENCY, techPhone: '972500000002' };
const withModules = (modules) => ({ ...BUSINESS, ownerPhone: OWNER, modules: { ...BUSINESS.modules, ...modules } });
const extra = (client, business) => ({ client, business, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const ctxOf = (env, business) => ({ env, business, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });

test('config lists every module, and everything is on unless switched off', () => {
  assert.deepEqual(Object.keys(BUSINESS.modules).sort(), [...MODULE_NAMES].sort());
  assert.ok(moduleOn({}, 'instagram'));
  assert.ok(!moduleOn({ modules: { instagram: false } }, 'instagram'));
});

test('referrals and offers off: their tools and their prompt sections are gone, and the tools refuse', async () => {
  const b = withModules({ referrals: false, offers: false });
  const names = toolsFor(b).map(t => t.name);
  assert.ok(!names.includes('refer_lead') && !names.includes('subscribe_offers'));
  assert.equal(toolsFor(BUSINESS).length, TOOLS.length - 2, 'the two opt-in tools (waitlist, addons) are off by default');
  const prompt = buildSystemPrompt(b, APARTMENTS);
  assert.doesNotMatch(prompt, /refer_lead|subscribe_offers|עמלה/);
  assert.match(prompt, /notify_owner עם הפרטים/);
  const r = await runTool('refer_lead', { customer_consented: true }, { ...ctxOf(fakeEnv(), b), conv: {} });
  assert.match(r.error, /לא פעיל/);

  // The model is actually sent the smaller tool list.
  const c = scriptedClient([say('היי', (p) => assert.ok(!p.tools.some(t => t.name === 'refer_lead')))]);
  await handleMessage(fakeEnv(), { from: '972541000000', id: 'r1', type: 'text', text: 'היי' }, extra(c, b));
});

test('instagram off: Instagram DMs get no answer (WhatsApp still does)', async () => {
  const env = fakeEnv();
  const b = withModules({ instagram: false });
  await handleMessage(env, { from: 'ig:1', id: 'i1', type: 'text', text: 'היי', channel: 'instagram' }, extra(scriptedClient([]), b));
  assert.equal(env.OUTBOX.length, 0);
  await handleMessage(env, { from: '972541000001', id: 'i2', type: 'text', text: 'היי' }, extra(scriptedClient([say('שלום')]), b));
  assert.equal(env.OUTBOX.at(-1).text, 'שלום');
});

test('voiceAndPhotos off: a voice note is not transcribed, the bot asks to write', async () => {
  const env = fakeEnv();
  env.AI = { run: () => { throw new Error('should not transcribe'); } };
  env.downloadMedia = () => { throw new Error('should not download'); };
  const c = scriptedClient([say('אפשר לכתוב לי?', (p) => assert.match(p.messages.at(-1).content.at(-1).text, /audio שאי אפשר לקרוא/))]);
  await handleMessage(env, { from: '972541000002', id: 'v1', type: 'audio', mediaId: 'MEDIA', text: '' }, extra(c, withModules({ voiceAndPhotos: false })));
  assert.equal(env.OUTBOX.at(-1).text, 'אפשר לכתוב לי?');
});

test('missedCalls off: no message to the caller', async () => {
  const env = fakeEnv();
  const r = await handleMissedCall(ctxOf(env, withModules({ missedCalls: false })), { from: '0541234567' }, Date.UTC(2027, 0, 10, 10));
  assert.equal(r.reason, 'disabled');
  assert.equal(env.OUTBOX.length, 0);
});

test('followUps off: a guest who went quiet after a price hears nothing', async () => {
  const run = async (b) => {
    const env = fakeEnv();
    const now = Date.now();
    await saveConv(env, { phone: '972541000003', name: '', messages: [{ role: 'user', text: 'כמה עולה?' }, { role: 'assistant', text: '1,600' }], lastUserAt: now - 5 * 3600e3, quotedAt: now - 5 * 3600e3, followups: 0 });
    await scheduled(ctxOf(env, b), now);
    return env.OUTBOX.filter(o => o.to === '972541000003').length;
  };
  assert.equal(await run(withModules({})), 1, 'on: one follow-up');
  assert.equal(await run(withModules({ followUps: false })), 0, 'off: nothing');
});

test('offers off: "מבצע:" tells David it isn\'t active and sends nothing', async () => {
  const env = fakeEnv();
  await handleOwner({ ...ctxOf(env, withModules({ offers: false })), phone: OWNER }, 'מבצע: 20% הנחה');
  assert.equal(env.OUTBOX.length, 1);
  assert.match(env.OUTBOX[0].text, /לא פעילה/);
});
