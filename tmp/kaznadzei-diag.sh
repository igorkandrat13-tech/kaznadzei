#!/usr/bin/env bash
# kaznadzei-diag.sh — диагностика Telegram Web App employee auth.
# Запуск:
#   cd /opt/kaznadzei
#   sudo chmod +x /tmp/kaznadzei-diag.sh
#   sudo bash /tmp/kaznadzei-diag.sh
#
# Результаты сохраняются в /tmp/kaznadzei-diag-*.txt,
# один общий архивный файл /tmp/kaznadzei-diag-report.txt — его отправьте разработчику.

set -u
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="/tmp"
REPORT_FILE="${OUT_DIR}/kaznadzei-diag-report.txt"
FILE_DIAG="${OUT_DIR}/kaznadzei-diag-01-telegram-diagnostics-${STAMP}.txt"
FILE_JOURNAL="${OUT_DIR}/kaznadzei-diag-02-journalctl-${STAMP}.txt"
FILE_ENDPOINT="${OUT_DIR}/kaznadzei-diag-03-endpoint-fvams2-${STAMP}.txt"

rm -f "${REPORT_FILE}" 2>/dev/null || true

touch "${REPORT_FILE}"
log() {
  local msg="$1"
  echo "${msg}" | tee -a "${REPORT_FILE}"
}
hr() {
  log ""
  log "======================================================================"
  log ""
}

log ""
log "Kaznadzei Telegram auth diagnostic report — generated ${STAMP}"
log "Working dir: $(pwd)"
log ""
hr

log "STEP 1/3 — Telegram diagnostics logs (last 80 events, newest top)"
log "Output file: ${FILE_DIAG}"
log ""
{
  echo "=== kaznadzei-diag step 1 — /api/telegram/client-diagnostics-log snapshot ==="
  echo "=== Timestamp: ${STAMP}"
  echo ""
  cd /opt/kaznadzei 2>/dev/null && node -e "
    try {
      const TD = require('./server/services/telegramDiagnostics');
      const all = (typeof TD.getTelegramDiagnosticLogs === 'function')
        ? TD.getTelegramDiagnosticLogs({ limit: 80 })
        : [];
      console.log('total returned logs =', all.length);
      console.log('');
      console.log('====== TOP = newest ======');
      all.slice().reverse().slice(-80).forEach((l,i) => {
        try {
          const t = new Date(l.createdAt||l.timestamp||0);
          const ts = t.toISOString().slice(11,19);
          const sc = String(l.scope||'').padEnd(15).slice(0,15);
          const ev = String(l.event||'').padEnd(50).slice(0,50);
          const d = JSON.stringify(l.details||{}).slice(0,340);
          const line = String(i).padStart(3,' ') + ' ' + ts + ' ' + sc + ' ' + ev + ' ' + d;
          console.log(line);
        } catch (err) {
          console.log('  row format err =', err.message);
        }
      });
      try {
        const h = (typeof TD.getHints === 'function') ? TD.getHints() : ((TD.getTelegramDiagnosticsHints && TD.getTelegramDiagnosticsHints()) || {});
        console.log('');
        console.log('=== HINTS counters ===');
        Object.keys(h).sort().forEach(k => console.log(String(k).padEnd(40,' '), '=', h[k]));
      } catch (herr) {
        console.log('hints error:', herr.message);
      }
    } catch (e) {
      console.log('FATAL step 1:', e.message);
      process.exit(1);
    }
  " 2>&1
} | tee -a "${REPORT_FILE}" > "${FILE_DIAG}"

hr

log "STEP 2/3 — journalctl -u kaznadzei last 10 minutes (120 lines tail) + fallback file logs"
log "Output file: ${FILE_JOURNAL}"
log ""
{
  echo "=== kaznadzei-diag step 2 — journalctl -u kaznadzei ==="
  echo "=== Timestamp: ${STAMP}"
  echo ""
  echo "--- journalctl system unit sudo -u kaznadzei last 30m 300 lines (tail 120) ---"
  if command -v journalctl >/dev/null 2>&1; then
    (sudo journalctl -u kaznadzei -n 300 --no-pager 2>&1 | tail -n 180) 2>&1
    echo ""
    echo "--- journalctl --user -u kaznadzei (fallback user unit) last 30m ---"
    (journalctl --user -u kaznadzei -n 300 --no-pager 2>&1 | tail -n 180) 2>&1 || true
  else
    echo "journalctl not available on this host."
  fi
  echo ""
  echo "--- candidate log files in /opt/kaznadzei and subdirs ---"
  (ls -lah /opt/kaznadzei/*.log /opt/kaznadzei/.runtime/*.log /opt/kaznadzei/logs/*.log /tmp/kaznadzei*.log 2>/dev/null) || echo "(no *.log candidates found in /opt/kaznadzei, /opt/kaznadzei/.runtime, /opt/kaznadzei/logs)"
  for f in /opt/kaznadzei/.runtime/app.log /opt/kaznadzei/app.log /opt/kaznadzei/server.log /opt/kaznadzei/.runtime/telegram-logs.json; do
    if [ -f "$f" ]; then
      echo ""
      echo "--- tail -n 120 of $(basename "$f") ---"
      (tail -n 120 "$f" 2>&1 || true)
    fi
  done
} | tee -a "${REPORT_FILE}" > "${FILE_JOURNAL}"

hr

log "STEP 3/3 — direct endpoint test POST /api/telegram/webapp/employee-link-by-code {code:'fvams2'}"
log "Output file: ${FILE_ENDPOINT}"
log ""
{
  echo "=== kaznadzei-diag step 3 — direct POST /api/telegram/webapp/employee-link-by-code ==="
  echo "=== Timestamp: ${STAMP}"
  echo ""
  cd /opt/kaznadzei 2>/dev/null && node << 'NODE_STEP3_END' 2>&1
(function main() {
  try {
    const Settings = require('./server/stores/settingsStore');
    const get = () => {
      try { return Settings.get && Settings.get(); } catch (e) { return Settings || {}; }
    };
    const s = get() || {};
    const publicBaseUrl = String(s.publicBaseUrl || '').trim();
    const http = require('http');
    const https = require('https');
    const urlLib = require('url');
    const payload = JSON.stringify({ code: 'fvams2' });

    const run = (opts) => {
      const lib = (opts.isHttps ? https : http);
      const req = lib.request({
        hostname: opts.hostname,
        port: Number(opts.port),
        path: '/api/telegram/webapp/employee-link-by-code',
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Host': opts.host || (opts.hostname + ':' + opts.port),
        },
        timeout: 10000,
      }, (res) => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          console.log('status =', res.statusCode);
          let bodyObj;
          try { bodyObj = JSON.parse(buf); } catch (e) { bodyObj = { raw: (buf || '').slice(0,400) }; }
          const safe = JSON.stringify(bodyObj, (k,v) => {
            if (k && /token|link|hash|signature/i.test(k)) return v && typeof v === 'string' ? ('••••' + v.slice(-8)) : v;
            return v;
          }, 2).slice(0,4000);
          console.log('body =', safe);
          process.exit(0);
        });
      });
      req.on('error', (e) => { console.log('request error:', e.message); process.exit(1); });
      req.on('timeout', () => { console.log('request timeout 10s'); req.destroy(new Error('timeout')); });
      req.write(payload);
      req.end();
      setTimeout(() => { console.log('process timeout 11s'); process.exit(2); }, 11000);
    };

    if (!publicBaseUrl) {
      console.log('Request: local 127.0.0.1 fallback');
      run({ isHttps: false, hostname: '127.0.0.1', port: Number(process.env.PORT || 3001), host: '127.0.0.1' });
      return;
    }
    let parsed;
    try { parsed = urlLib.parse(publicBaseUrl); } catch (u) { parsed = null; }
    const isHttps = parsed && parsed.protocol === 'https:';
    const hostname = (parsed && parsed.hostname) || '127.0.0.1';
    const port = (parsed && parsed.port) ? parseInt(parsed.port,10) : (isHttps ? 443 : 80);
    const host = (parsed && parsed.host) ? parsed.host : (hostname + ':' + port);
    console.log('Request:', JSON.stringify({
      isHttps,
      hostname,
      port,
      path: '/api/telegram/webapp/employee-link-by-code',
      publicBaseUrl: publicBaseUrl.slice(0,120),
    }));
    run({ isHttps, hostname, port, host });
  } catch (e) {
    console.log('FATAL step 3:', e.message);
    process.exit(1);
  }
})();
NODE_STEP3_END
} | tee -a "${REPORT_FILE}" > "${FILE_ENDPOINT}"

hr
log "=== DIAGNOSTIC COMPLETE ==="
log ""
log "Per-step output files:"
log "  - STEP 1 (Telegram diagnostics logs): ${FILE_DIAG}"
log "  - STEP 2 (journalctl last 10m):       ${FILE_JOURNAL}"
log "  - STEP 3 (endpoint test fvams2):      ${FILE_ENDPOINT}"
log ""
log "Combined report (отправьте этот файл разработчику):"
log "  >>>  ${REPORT_FILE}  <<<"
log ""
log "Чтобы отправить (простой вариант): скопируйте и вставьте в чат содержимое файла:"
log "  cat ${REPORT_FILE}"
log ""
