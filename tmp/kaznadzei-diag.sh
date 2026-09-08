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

log "STEP 2/3 — journalctl -u kaznadzei last 10 minutes (120 lines tail)"
log "Output file: ${FILE_JOURNAL}"
log ""
{
  echo "=== kaznadzei-diag step 2 — journalctl -u kaznadzei ==="
  echo "=== Timestamp: ${STAMP}"
  echo ""
  (sudo journalctl -u kaznadzei --since "10 min ago" --no-pager -n 200 2>&1 | tail -n 120) 2>&1
} | tee -a "${REPORT_FILE}" > "${FILE_JOURNAL}"

hr

log "STEP 3/3 — direct endpoint test POST /api/telegram/webapp/employee-link-by-code {code:'fvams2'}"
log "Output file: ${FILE_ENDPOINT}"
log ""
{
  echo "=== kaznadzei-diag step 3 — direct POST /api/telegram/webapp/employee-link-by-code ==="
  echo "=== Timestamp: ${STAMP}"
  echo ""
  cd /opt/kaznadzei 2>/dev/null && node -e "
    try {
      const Settings = require('./server/stores/settingsStore');
      const get = () => {
        try { return Settings.get && Settings.get(); } catch { return Settings; }
      };
      const s = get() || {};
      const publicBaseUrl = String(s.publicBaseUrl || '').trim();
      if (!publicBaseUrl) {
        const http = require('http');
        const payload = JSON.stringify({ code: 'fvams2' });
        const req = http.request({
          hostname: '127.0.0.1',
          port: Number(process.env.PORT || 3001),
          path: '/api/telegram/webapp/employee-link-by-code',
          method: 'POST',
          headers: {
            'Content-Type':'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Host':'127.0.0.1',
          },
        }, (res) => {
          let buf = '';
          res.on('data', c => buf += c);
          res.on('end', () => {
            console.log('status =', res.statusCode);
            const cleanBuf = buf.length > 4000 ? buf.slice(0,4000) + '...(truncated)' : buf;
            console.log('body =', cleanBuf);
          });
        });
        req.on('error', e => console.log('request error:', e.message));
        req.setTimeout(10000, () => { console.log('request timeout 10s'); req.destroy(new Error('timeout')); });
        req.write(payload); req.end();
        return;
      }
      const url = require('url');
      const parsed = url.parse(publicBaseUrl);
      const isHttps = (parsed.protocol === 'https:');
      const lib = isHttps ? require('https') : require('http');
      const payload = JSON.stringify({ code: 'fvams2' });
      const options = {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || (isHttps ? 443 : 80), 10),
        path: '/api/telegram/webapp/employee-link-by-code',
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Host': parsed.host || (parsed.hostname + ':' + parsed.port),
        },
      };
      console.log('Request:', JSON.stringify({ isHttps, hostname: options.hostname, port: options.port, path: options.path, publicBaseUrl: publicBaseUrl.slice(0,120) }));
      const req = lib.request(options, (res) => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          console.log('status =', res.statusCode);
          const bodyObj = (() => { try { return JSON.parse(buf); } catch { return { raw: buf.slice(0,200) }; } })();
          const safeBody = JSON.stringify(bodyObj, (k,v) => {
            if (k && /token|link|hash|signature/i.test(k)) return v && typeof v === 'string' ? ('••••' + v.slice(-8)) : v;
            return v;
          }, 2).slice(0,4000);
          console.log('body =', safeBody);
        });
      });
      req.on('error', e => console.log('request error:', e.message));
      req.setTimeout(10000, () => { console.log('request timeout 10s'); req.destroy(new Error('timeout')); });
      req.write(payload); req.end();
      setTimeout(() => { /* keep process alive */ }, 11000);
    } catch (e) {
      console.log('FATAL step 3:', e.message);
      process.exit(1);
    }
  " 2>&1
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
