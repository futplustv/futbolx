// api/token.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: 'Missing url parameter'
    });
  }

  const SECRET_KEY = process.env.STREAM_SECRET_KEY;

  if (!SECRET_KEY) {
    return res.status(500).json({
      error: 'STREAM_SECRET_KEY is not configured'
    });
  }

  const FLUSSONIC_SERVERS = [
    process.env.CDN_BASE_URL,
    process.env.CDN_BASE_URL_2
  ]
    .filter(Boolean)
    .map(server => server.replace(/\/+$/, ''));

  let streamUrl;

  try {
    streamUrl = new URL(url);
  } catch {
    return res.status(400).json({
      error: 'Invalid stream URL'
    });
  }

  const requestOrigin =
    streamUrl.origin.replace(/\/+$/, '');

  /*
   * Automatically find which configured Flussonic
   * server this stream belongs to.
   */
  const matchedServer =
    FLUSSONIC_SERVERS.find(server => {
      try {
        return new URL(server).origin === requestOrigin;
      } catch {
        return false;
      }
    });

  /*
   * This is not one of our protected Flussonic
   * servers.
   *
   * Let the frontend play it normally.
   */
  if (!matchedServer) {
    return res.status(200).json({
      protected: false,
      url
    });
  }

  /*
   * Convert:
   *
   * /channel1/index.m3u8
   *
   * into:
   *
   * channel1
   */
  let stream =
    streamUrl.pathname
      .replace(/^\/+/, '')
      .replace(/\/index\.m3u8$/i, '');

  if (!stream) {
    return res.status(400).json({
      error: 'Could not determine Flussonic stream name'
    });
  }

  stream = decodeURIComponent(stream);

  const now =
    Math.floor(Date.now() / 1000);

  /*
   * Token starts 5 minutes before current time
   * to account for small clock differences.
   *
   * Lifetime: 3 hours.
   */
  const start =
    now - 300;

  const end =
    now + 10800;

  const salt =
    crypto.randomBytes(8).toString('hex');

  /*
   * Official Flussonic securetoken formula:
   *
   * stream + no_check_ip + start + end + secret + salt
   */
  const stringToHash =
    `${stream}no_check_ip${start}${end}${SECRET_KEY}${salt}`;

  const hash =
    crypto
      .createHash('sha1')
      .update(stringToHash)
      .digest('hex');

  const token =
    `${hash}-${salt}-${end}-${start}`;

  const tokenizedUrl =
    `${matchedServer}/${stream}/index.m3u8?token=${token}`;

  return res.status(200).json({
    protected: true,
    url: tokenizedUrl
  });
};
