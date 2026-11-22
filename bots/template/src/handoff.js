// When David answers a guest himself, the bot goes quiet in that chat for a while
// (config BUSINESS.handoff.pauseHours) instead of talking over him. David can give the
// chat back to the bot with "הפעל 0541234567".

import { getConv, saveConv } from './store.js';

const OWN_ECHO_MS = 45e3; // an echo this soon after the bot wrote is the bot's own message

export const pauseMs = (business) => (business?.handoff?.pauseHours ?? 12) * 3600e3;

// echo: { to, text } from whatsappEchoes / instagramEchoes. Returns true if the chat was paused.
export async function handleEcho(ctx, echo, now = Date.now()) {
  const conv = await getConv(ctx.env, echo.to);
  if (conv.botAt && now - conv.botAt < OWN_ECHO_MS) return false;
  const text = (echo.text || '').trim();
  const botSaid = text && conv.messages.slice(-6).some(m => m.role === 'assistant' && m.text.trim() === text);
  if (botSaid) return false;
  conv.humanUntil = now + pauseMs(ctx.business);
  conv.followups = 99; // no "still interested?" nudges while David is in the chat
  if (text) conv.messages.push({ role: 'assistant', text: `[${ctx.business.botName} ענה בעצמו:] ${text}` });
  await saveConv(ctx.env, conv);
  return true;
}

export const isPaused = (conv, now = Date.now()) => (conv.humanUntil || 0) > now;

// Owner commands. phone is already normalized (digits with country code, or ig:...).
export async function setPause(env, business, phone, on, now = Date.now()) {
  const conv = await getConv(env, phone);
  conv.humanUntil = on ? now + pauseMs(business) : 0;
  await saveConv(env, conv);
}
