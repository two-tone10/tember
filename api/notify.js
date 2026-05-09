const THOUGHTS = [
  'What would you do today if you knew it would matter to someone ten years from now?',
  'Purpose is not a destination. It is a direction.',
  'Who needs something only you can give?',
  'Your contribution does not have to be grand. It has to be honest.',
  'Meaning is made in moments of genuine connection.',
  'What gifts have you been too afraid to share?'
];

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

function thoughtForNow() {
  const h = new Date().getHours();
  return THOUGHTS[h % THOUGHTS.length];
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function slotKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
}

function shouldSend(subscriber, now = new Date()) {
  const last = subscriber.last_sent_at ? new Date(subscriber.last_sent_at) : null;
  const hour = now.getHours();
  if (subscriber.pace === 'hourly') {
    return !last || now - last > 55 * 60000;
  }
  if (subscriber.pace === '3x') {
    return [8, 13, 18].includes(hour) && (!last || slotKey(last) !== slotKey(now));
  }
  return hour === 8 && (!last || last.toDateString() !== now.toDateString());
}

async function sendEmail(to, thought) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Resend is not configured.');

  const appUrl = process.env.TEMBER_APP_URL || 'https://tember.vercel.app';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your Tember reflection',
      text: `${thought}\n\nOpen Tember: ${appUrl}\n\nYou can change or cancel reminders in Settings.`,
      html: `
        <div style="font-family: Georgia, serif; color:#2b2621; line-height:1.55; max-width:560px;">
          <p style="font-size:18px;">${thought}</p>
          <p><a href="${appUrl}" style="color:#7b4e37;">Open Tember</a></p>
          <p style="font-size:13px; color:#776d64;">You can change or cancel reminders in Settings.</p>
        </div>
      `
    })
  });
  if (!response.ok) throw new Error(`Resend failed with ${response.status}`);
}

async function markSubscriber(id, patch) {
  return supabase(`tember_subscribers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const secret = process.env.NOTIFY_SECRET;
    const authorized = secret && (
      url.searchParams.get('secret') === secret ||
      req.headers.authorization === `Bearer ${secret}`
    );
    if (secret && !authorized) {
      return send(res, 401, { ok: false, error: 'Unauthorized.' });
    }

    if (url.searchParams.get('test') === '1') {
      if (!authorized) return send(res, 401, { ok: false, error: 'Test sends require NOTIFY_SECRET.' });
      const to = cleanEmail(url.searchParams.get('to'));
      if (!to) return send(res, 400, { ok: false, error: 'Add a valid test email with ?to=you@example.com.' });
      await sendEmail(to, thoughtForNow());
      return send(res, 200, { ok: true, test: true, to });
    }

    const subscribers = await supabase(
      'tember_subscribers?select=id,email,pace,last_sent_at&status=eq.active&channel=eq.email&email=not.is.null&limit=1000'
    );
    const due = subscribers.filter((subscriber) => shouldSend(subscriber));
    const thought = thoughtForNow();
    const results = [];

    for (const subscriber of due) {
      try {
        await sendEmail(subscriber.email, thought);
        await markSubscriber(subscriber.id, { last_sent_at: new Date().toISOString(), last_error: null });
        results.push({ id: subscriber.id, ok: true });
      } catch (error) {
        await markSubscriber(subscriber.id, { last_error: error.message });
        results.push({ id: subscriber.id, ok: false, error: error.message });
      }
    }

    return send(res, 200, { ok: true, checked: subscribers.length, due: due.length, results });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      ok: false,
      error: error.message,
      details: error.details
    });
  }
};
