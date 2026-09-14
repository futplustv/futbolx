// api/token.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { stream, server } = req.query;

  if (!stream) {
    return res.status(400).json({ error: 'Missing stream parameter' });
  }

  const SECRET_KEY =
    process.env.STREAM_SECRET_KEY || 'my_super_secret_key_123';

  // CHANGE THESE TO YOUR TWO REAL FLUSSONIC DOMAINS
  const FLUSSONIC_SERVERS = {
    1: 'https://random.com',
    2: 'https://random2.com'
  };

  const selectedServer = String(server || '1');
  const CDN_BASE_URL = FLUSSONIC_SERVERS[selectedServer];

  if (!CDN_BASE_URL) {
    return res.status(400).json({ error: 'Invalid server' });
  }

  const now = Math.floor(Date.now() / 1000);

  const start = now - 300;
  const end = now + 60;

  const salt = crypto.randomBytes(8).toString('hex');

  // IMPORTANT:
  // Because Flussonic uses no_check_ip=true,
  // the literal "no_check_ip" replaces the viewer IP.
  const stringToHash =
    `${stream}no_check_ip${start}${end}${SECRET_KEY}${salt}`;

  const hash = crypto
    .createHash('sha1')
    .update(stringToHash)
    .digest('hex');

  const token =
    `${hash}-${salt}-${end}-${start}`;

  const tokenizedUrl =
    `${CDN_BASE_URL}/${stream}/index.m3u8?token=${token}`;

  return res.status(200).json({
    url: tokenizedUrl
  });
};
