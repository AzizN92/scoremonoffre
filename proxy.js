require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required');
const LEADS_FILE = path.join(__dirname, 'leads.json');

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'score.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/leads', (req, res) => {
  try {
    const leads = fs.existsSync(LEADS_FILE)
      ? JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'))
      : [];
    leads.push({ ...req.body, date: new Date().toISOString() });
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
    res.json({ ok: true });
  } catch (err) {
    console.error('Lead save error:', err);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

app.get('/api/admin/leads', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
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

app.post('/api/chat', async (req, res) => {
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
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
