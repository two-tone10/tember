const TABLES = {
  subscribers: 'tember_subscribers',
  sparks: 'tember_sparks',
  events: 'tember_events'
};

const VALID_PACES = new Set(['hourly', '3x', 'daily']);
const VALID_CHANNELS = new Set(['email', 'phone']);
const VALID_TAGS = new Set(['resonated', 'with-it', 'missed', '']);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error('Supabase environment variables are not configured.');
    err.statusCode = 503;
    throw err;
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function supabase(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(data?.message || `Supabase request failed: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanPhone(value) {
  const raw = cleanText(value);
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.length >= 10 ? digits : '';
}

function cleanPace(value) {
  const pace = cleanText(value, 'daily');
  return VALID_PACES.has(pace) ? pace : 'daily';
}

function hourKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}`;
}

function priorHourKeys(count = 5) {
  return Array.from({ length: count }, (_, index) => hourKey(new Date(Date.now() - (index + 1) * 3600000)));
}

function selectSubscriberFields() {
  return 'id,name,email,phone,pace,channel,status,unsubscribe_token,updated_at';
}

async function upsertSubscriber(payload) {
  const email = cleanEmail(payload.email);
  const phone = cleanPhone(payload.phone);
  const name = cleanText(payload.name).slice(0, 80);
  const pace = cleanPace(payload.pace);
  const requestedChannel = cleanText(payload.channel);
  const channel = VALID_CHANNELS.has(requestedChannel)
    ? requestedChannel
    : email ? 'email' : phone ? 'phone' : 'email';

  if (!email && !phone) {
    const err = new Error('Add an email or phone number to sign up.');
    err.statusCode = 400;
    throw err;
  }
  if (channel === 'email' && !email) {
    const err = new Error('Email is required for email notifications.');
    err.statusCode = 400;
    throw err;
  }
  if (channel === 'phone' && !phone) {
    const err = new Error('Phone number is required for phone notifications.');
    err.statusCode = 400;
    throw err;
  }

  const row = {
    name,
    email: email || null,
    phone: phone || null,
    pace,
    channel,
    status: 'active',
    canceled_at: null
  };

  const conflict = email ? 'email' : 'phone';
  const rows = await supabase(`${TABLES.subscribers}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });

  return rows?.[0] || null;
}

async function cancelSubscriber(payload) {
  const email = cleanEmail(payload.email);
  const phone = cleanPhone(payload.phone);
  const token = cleanText(payload.token);
  const filters = [];

  if (token) filters.push(`unsubscribe_token=eq.${encodeURIComponent(token)}`);
  else if (email) filters.push(`email=eq.${encodeURIComponent(email)}`);
  else if (phone) filters.push(`phone=eq.${encodeURIComponent(phone)}`);
  else {
    const err = new Error('Add the email or phone number to cancel notifications.');
    err.statusCode = 400;
    throw err;
  }

  const rows = await supabase(`${TABLES.subscribers}?${filters.join('&')}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ status: 'canceled', canceled_at: new Date().toISOString() })
  });

  return rows?.[0] || null;
}

async function createSpark(payload) {
  const text = cleanText(payload.text).slice(0, 500);
  if (!text) {
    const err = new Error('Reflection text is required.');
    err.statusCode = 400;
    throw err;
  }
  const tag = cleanText(payload.tag);
  if (!VALID_TAGS.has(tag)) {
    const err = new Error('Unknown reflection tag.');
    err.statusCode = 400;
    throw err;
  }

  const row = {
    hour_key: cleanText(payload.hour_key, hourKey()),
    thought_index: Number.parseInt(payload.thought_index, 10) || 0,
    thought: cleanText(payload.thought).slice(0, 500),
    quote: cleanText(payload.quote).slice(0, 700),
    author: cleanText(payload.author).slice(0, 160),
    name: cleanText(payload.name, 'Anonymous').slice(0, 80),
    tag: tag || null,
    text
  };

  const rows = await supabase(TABLES.sparks, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] || null;
}

async function resonate(payload) {
  const id = cleanText(payload.id);
  if (!id) {
    const err = new Error('Reflection id is required.');
    err.statusCode = 400;
    throw err;
  }
  const rows = await supabase(`${TABLES.sparks}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ resonance_count: Number.parseInt(payload.count, 10) || 1 })
  });
  return rows?.[0] || null;
}

async function recordEvent(payload) {
  return supabase(TABLES.events, {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      event_type: cleanText(payload.event_type, 'event').slice(0, 80),
      payload: payload.payload || {}
    })
  });
}

async function bootstrap() {
  const keys = [hourKey(), ...priorHourKeys(5)];
  const keyFilter = keys.map((key) => `"${key}"`).join(',');
  const sparks = await supabase(
    `${TABLES.sparks}?select=*&hour_key=in.(${keyFilter})&status=eq.approved&order=created_at.desc&limit=200`
  );
  return { hour_key: keys[0], prior_hour_keys: keys.slice(1), sparks: sparks || [] };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return send(res, 200, { ok: true, data: await bootstrap() });
    }

    if (req.method !== 'POST') {
      res.setHeader('allow', 'GET, POST');
      return send(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const action = cleanText(body.action);
    const payload = body.payload || {};

    if (action === 'subscribe') {
      return send(res, 200, { ok: true, data: await upsertSubscriber(payload) });
    }
    if (action === 'cancel') {
      return send(res, 200, { ok: true, data: await cancelSubscriber(payload) });
    }
    if (action === 'spark') {
      return send(res, 200, { ok: true, data: await createSpark(payload) });
    }
    if (action === 'resonate') {
      return send(res, 200, { ok: true, data: await resonate(payload) });
    }
    if (action === 'event') {
      await recordEvent(payload);
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { ok: false, error: 'Unknown action.' });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      ok: false,
      error: error.message,
      details: error.details
    });
  }
};
