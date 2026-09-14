// api/token.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { stream, server } = req.query;

  if (!stream) {
    return res.status(400).json({
      error: 'Missing stream parameter'
    });
  }

  const SECRET_KEY = process.env.STREAM_SECRET_KEY;

  if (!SECRET_KEY) {
    return res.status(500).json({
      error: 'STREAM_SECRET_KEY is not configured'
    });
  }

  const FLUSSONIC_SERVERS = {
    1: process.env.CDN_BASE_URL,
    2: process.env.CDN_BASE_URL_2
  };

  const selectedServer = String(server || '1');
  const CDN_BASE_URL = FLUSSONIC_SERVERS[selectedServer];

  if (!CDN_BASE_URL) {
    return res.status(500).json({
      error: `Flussonic server ${selectedServer} is not configured`
    });
  }

  const now = Math.floor(Date.now() / 1000);

  const start = now - 300;
  const end = now + 10800;

  const salt = crypto.randomBytes(8).toString('hex');

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
