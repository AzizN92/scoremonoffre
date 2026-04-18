require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;

// Nettoie la clé API : retire retours à la ligne, espaces, = au début
const RAW_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_KEY = RAW_KEY.replace(/[\r\n\s]/g, '').replace(/^=+/, '');
if (!API_KEY) console.error('WARNING: ANTHROPIC_API_KEY is empty');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required');
const LEADS_FILE = path.join(__dirname, 'leads.json');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

if (SUPABASE_ENABLED) {
  console.log('Supabase connected');
} else {
  console.log('Supabase disabled — using local leads.json');
}

const supabaseHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const leadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'score.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/leads', leadsLimiter, async (req, res) => {
  const { firstname, lastname, email } = req.body || {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!firstname || !lastname || !email) {
    return res.status(400).json({ error: 'Missing required fields: firstname, lastname, email' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if ([firstname, lastname, email].some(f => typeof f !== 'string' || f.length > 200)) {
    return res.status(400).json({ error: 'Field exceeds maximum length of 200 characters' });
  }

  const payload = { ...req.body };
  if ('followers' in payload) {
    const parsed = parseInt(payload.followers, 10);
    payload.followers = isNaN(parsed) ? null : parsed;
  }
  if (typeof payload.answers === 'string') {
    try { payload.answers = JSON.parse(payload.answers); } catch (_) { payload.answers = null; }
  }

  if (SUPABASE_ENABLED) {
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify(payload),
      });
      if (!sbRes.ok) {
        const errText = await sbRes.text();
        throw new Error(`Supabase ${sbRes.status}: ${errText}`);
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Supabase lead save error, falling back to local:', err.message);
    }
  }

  try {
    const leads = fs.existsSync(LEADS_FILE)
      ? JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'))
      : [];
    leads.push({ ...payload, date: new Date().toISOString() });
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
    res.json({ ok: true });
  } catch (err) {
    console.error('Lead save error:', err);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

app.get('/api/admin/leads', adminLimiter, async (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (SUPABASE_ENABLED) {
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?order=created_at.desc`, {
        method: 'GET',
        headers: supabaseHeaders,
      });
      if (!sbRes.ok) {
        const errText = await sbRes.text();
        throw new Error(`Supabase ${sbRes.status}: ${errText}`);
      }
      const leads = await sbRes.json();
      return res.json(leads);
    } catch (err) {
      console.error('Supabase read error, falling back to local:', err.message);
    }
  }

  try {
    const leads = fs.existsSync(LEADS_FILE)
      ? JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'))
      : [];
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read leads' });
  }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
