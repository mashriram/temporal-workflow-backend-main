const http = require('http');

// Stand-in for the real internal PKI/cert-management + JWKS service that
// the certificate-configuration reference workflow (goal.md §3.9) calls
// in production. Every hit is logged so this script itself is evidence
// the workflow's HTTP nodes performed real network calls, not stubs.
// See README.md in this directory for how to run the reference workflow
// against it end-to-end.
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${req.method} ${req.url} body=${body}`);

    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/check') {
      const parsed = body ? JSON.parse(body) : {};
      // Both cert types are present in this reference run so the full
      // Encrypt/Decrypt -> JWKS -> Verify -> HITL -> Sign -> JWKS chain
      // actually executes end-to-end.
      res.end(JSON.stringify({ present: true, certType: parsed.certType }));
      return;
    }

    if (req.url === '/register') {
      const parsed = body ? JSON.parse(body) : {};
      res.end(
        JSON.stringify({
          registered: true,
          certType: parsed.type,
          serial: `CERT-${parsed.type}-0001`,
        }),
      );
      return;
    }

    if (req.url === '/clone-access') {
      res.end(JSON.stringify({ cloned: true }));
      return;
    }

    if (req.url === '/jwks/push') {
      const parsed = body ? JSON.parse(body) : {};
      res.end(
        JSON.stringify({ pushed: true, certType: parsed.certType, kid: `kid-${parsed.certType}` }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

const PORT = 4790;
server.listen(PORT, () => {
  console.log(`Mock cert-management API listening on http://localhost:${PORT}`);
});
