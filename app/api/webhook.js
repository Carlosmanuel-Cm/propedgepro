import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

  const supabaseUrl  = process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  // Read raw body BEFORE parsing — needed for HMAC verification
  const rawBody = await readRawBody(req);

  // Verify Lemon Squeezy signature
  const signature = req.headers['x-signature'];
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const eventName  = body?.meta?.event_name;
  const customData = body?.meta?.custom_data;
  const userId     = customData?.user_id;

  if (eventName !== 'order_created') {
    return res.status(200).json({ received: true, action: 'ignored', event: eventName });
  }

  if (!userId) {
    return res.status(400).json({ error: 'No user_id in custom_data' });
  }

  // Update profiles using service role key (bypasses RLS)
  const r = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ is_premium: true }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return res.status(502).json({ error: `Supabase update failed: ${detail}` });
  }

  return res.status(200).json({ received: true, action: 'upgraded', userId });
}
