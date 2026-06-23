export default async function handler(req, res) {
  const key = process.env.FCS_API_KEY;
  if (!key) return res.status(500).json({ error: 'FCS_API_KEY no configurada' });

  const today = new Date();
  const from  = today.toISOString().split('T')[0];
  const to    = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let raw;
  try {
    const r = await fetch(
      `https://fcsapi.com/api-v3/forex/economy_cal?from=${from}&to=${to}&access_key=${key}`
    );
    if (!r.ok) throw new Error(`FCS API respondió ${r.status}`);
    raw = await r.json();
  } catch (e) {
    return res.status(502).json({ error: `Error de red al contactar FCS API: ${e.message}` });
  }

  if (raw.status === false) {
    return res.status(502).json({ error: raw.msg || 'FCS API devolvió error desconocido' });
  }

  const ALLOWED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'NZD']);
  const EXCLUDED_INDICATORS = new Set(['Holidays', 'Calendar']);

  const IMPACT = { '0': 'low', '1': 'medium', '2': 'high' };

  const fmt = (v, u) => (v != null && v !== '') ? `${v}${u || ''}` : '';

  const events = (raw.response || [])
    .filter(ev => ALLOWED.has(ev.currency) && !EXCLUDED_INDICATORS.has(ev.indicator))
    .map(ev => {
      // FCS date viene como "YYYY-MM-DD HH:MM:SS" en UTC
      const dt     = new Date(ev.date.replace(' ', 'T') + 'Z');
      const timeET = dt.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const dateET = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      const actualNum   = ev.actual   !== '' ? parseFloat(ev.actual)   : null;
      const forecastNum = ev.forecast !== '' ? parseFloat(ev.forecast) : null;
      const beat = actualNum !== null && forecastNum !== null
        ? actualNum >= forecastNum
        : null;

      return {
        date:     dateET,
        time:     timeET,
        currency: ev.currency,
        impact:   IMPACT[String(ev.importance)] || 'low',
        event:    ev.title || '—',
        prev:     fmt(ev.previous, ev.unit),
        forecast: fmt(ev.forecast, ev.unit),
        actual:   fmt(ev.actual,   ev.unit),
        beat,
      };
    })
    .sort((a, b) => {
      const da = `${a.date}T${a.time}`;
      const db = `${b.date}T${b.time}`;
      return da < db ? -1 : da > db ? 1 : 0;
    });

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json({ events });
}
