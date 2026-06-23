export default async function handler(req, res) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return res.status(500).json({ error: 'FINNHUB_API_KEY no configurada' });

  const today = new Date();
  const from  = today.toISOString().split('T')[0];
  const to    = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let raw;
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`
    );
    if (!r.ok) throw new Error(`Finnhub respondió ${r.status}`);
    raw = await r.json();
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const CURRENCY = {
    US: 'USD', EU: 'EUR', EMU: 'EUR', EA: 'EUR',
    GB: 'GBP', JP: 'JPY', CA: 'CAD',
    AU: 'AUD', NZ: 'NZD', CH: 'CHF',
  };

  const fmt = (v, u) => v != null ? `${v}${u || ''}` : '';

  const events = (raw.economicCalendar || []).map(ev => {
    const dt     = new Date(ev.time.replace(' ', 'T') + 'Z');
    const timeET = dt.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const beat = ev.actual != null && ev.estimate != null
      ? ev.actual >= ev.estimate
      : null;
    return {
      date:     dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
      time:     timeET,
      currency: CURRENCY[ev.country] || ev.country || '—',
      impact:   (ev.impact || 'low').toLowerCase(),
      event:    ev.event || '—',
      prev:     fmt(ev.prev,     ev.unit),
      forecast: fmt(ev.estimate, ev.unit),
      actual:   fmt(ev.actual,   ev.unit),
      beat,
    };
  });

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  return res.status(200).json({ events });
}
