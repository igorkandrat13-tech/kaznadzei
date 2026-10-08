#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kaznadzei}"
SERVICE_NAME="${SERVICE_NAME:-kaznadzei}"
PORT="${PORT:-5000}"
HEALTHZ_URL="${HEALTHZ_URL:-http://127.0.0.1:${PORT}/healthz}"
LOG_DIR="${LOG_DIR:-${APP_DIR}/logs}"
LOG_FILE="${LOG_DIR}/disk-analysis-$(date +%Y%m%d-%H%M%S).log"
TOP_N_FILES="${TOP_N_FILES:-80}"
TOP_N_DIRS_D1="${TOP_N_DIRS_D1:-25}"
TOP_N_DIRS_D2="${TOP_N_DIRS_D2:-40}"
SAFE_DELETE_LIST_FILE="${LOG_DIR}/safe-to-delete-$(date +%Y%m%d-%H%M%S).txt"

mkdir -p "$LOG_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

hr() { echo "============================================================"; }
h1() { echo ""; hr; echo " $1"; hr; }
h2() { echo ""; echo "## $1"; echo "---"; }

ts_now() { date +"%Y-%m-%d %H:%M:%S"; }

safe_du_summaries_mb() {
  local target="$1"
  local depth="$2"
  local limit="$3"
  if [[ -d "$target" ]]; then
    du -x --max-depth="$depth" -k "$target" 2>/dev/null \
      | sort -nr \
      | head -n "$limit" \
      | awk '{ printf "%10.1f MB  %s\n", $1/1024, substr($0, index($0,$2)) }'
  else
    echo "  (путь не существует: $target)"
  fi
}

human_size_bytes() {
  local b="$1"
  awk -v b="$b" 'BEGIN{ split("B KB MB GB TB", u); i=1; while(b>=1024 && i<5){b/=1024;i++} printf "%.2f %s", b, u[i] }'
}

current_running_kernel() { uname -r | sed 's/-[a-z]*$//' | sed 's/-.*$//'; }

h1 "Kaznadzei Disk Usage Analysis"
echo "Старт          : $(ts_now)"
echo "Узел           : $(hostname)"
echo "Пользователь   : $USER (uid=$(id -u))"
echo "APP_DIR        : $APP_DIR"
echo "SERVICE_NAME   : $SERVICE_NAME"
echo "PORT           : $PORT"
echo "HEALTHZ        : $HEALTHZ_URL"
echo "LOG_FILE       : $LOG_FILE"
echo "SAFE_DELETE    : $SAFE_DELETE_LIST_FILE"
echo ""
echo "ВАЖНО: этот скрипт НИЧЕГО НЕ УДАЛЯЕТ. Только собирает факты."

# ---------- SECTION 1: df/blkid/lvm ----------
h1 "1. Обзор файловых систем и блочных устройств (df, lsblk, LVM)"
h2 "df -h (все точки монтирования)"
df -h || true
echo ""
h2 "df -h / (корневой раздел — то, что /dev/mapper на скринах)"
df -h / || true
echo ""
h2 "lsblk -f (физическая структура /dev/sda vs LVM тома)"
command -v lsblk >/dev/null 2>&1 && lsblk -f || echo "lsblk не установлен"
echo ""
h2 "vgs + lvs (LVM volume / logical volumes)"
command -v vgs >/dev/null 2>&1 && vgs || echo "vgs не установлен"
command -v lvs >/dev/null 2>&1 && lvs || echo "lvs не установлен"

# ---------- SECTION 2: du top dirs ----------
h1 "2. Распределение места (du, без переходов между ФС)"
h2 "Топ-${TOP_N_DIRS_D1} директорий /  (1-й уровень)"
safe_du_summaries_mb / 1 "$TOP_N_DIRS_D1"
echo ""
h2 "Топ-${TOP_N_DIRS_D2} директорий /opt  (2-й уровень)"
safe_du_summaries_mb /opt 2 "$TOP_N_DIRS_D2"
echo ""
h2 "Топ-${TOP_N_DIRS_D2} директорий /var  (2-й уровень)"
safe_du_summaries_mb /var 2 "$TOP_N_DIRS_D2"
echo ""
h2 "Топ-${TOP_N_DIRS_D2} директорий /usr  (2-й уровень)"
safe_du_summaries_mb /usr 2 "$TOP_N_DIRS_D2"
echo ""
h2 "Топ-${TOP_N_DIRS_D2} директорий /home  (2-й уровень)"
safe_du_summaries_mb /home 2 "$TOP_N_DIRS_D2"
echo ""
h2 "Детально: проект ${APP_DIR} (3-й уровень)"
safe_du_summaries_mb "$APP_DIR" 3 80

# ---------- SECTION 3: top largest files ----------
h1 "3. Самые крупные файлы (топ-${TOP_N_FILES}) в корневой ФС"
h2 "find / -xdev -type f -printf '%s %p\\n' | sort -nr | head -${TOP_N_FILES}"
find / -xdev -type f -printf '%s %p\n' 2>/dev/null \
  | sort -nr \
  | head -n "$TOP_N_FILES" \
  | awk 'BEGIN{ split("B KB MB GB TB", u) }
         {
           b=$1; p=""; for (i=2;i<=NF;i++) p = p (i>2?" ":"") $i;
           i=1; bb=b; while(bb>=1024 && i<5){bb/=1024;i++}
           printf "%10.2f %s   %s\n", bb, u[i], p
         }'

# ---------- SECTION 4: specific hotspots ----------
h1 "4. Типичные «съедатели места» — детали по каждому"

# apt
h2 "APT / dpkg кэш .deb + старые пакеты"
echo -n "/var/cache/apt/archives:   "
if [[ -d /var/cache/apt/archives ]]; then
  BYTES=$(du -sb /var/cache/apt/archives 2>/dev/null | awk '{print $1}')
  human_size_bytes "$BYTES"
  echo ""
  echo "  apt-cache stats:"
  command -v apt-cache >/dev/null 2>&1 && apt-cache stats 2>/dev/null | head -n 10 || true
else
  echo "  (нет)"
fi

# journal
h2 "systemd journal"
if command -v journalctl >/dev/null 2>&1; then
  journalctl --disk-usage || true
  echo ""
  echo "  Конфиг journald (/etc/systemd/journald.conf grep SystemMax|MaxRetention):"
  grep -iE '^SystemMaxUse|^SystemMaxFileSize|^MaxRetentionSec' /etc/systemd/journald.conf 2>/dev/null || echo "   (нет явных лимитов, использует дефолт 10% FS, не более 4G)"
else
  echo "  journalctl не установлен"
fi

# kernels
h2 "Ядра Linux (linux-image + linux-headers)"
RUNNING_FULL="$(uname -r)"
RUNNING_BASE="$(current_running_kernel)"
echo "ЗАПУЩЕНО СЕЙЧАС      : $RUNNING_FULL  (НЕ УДАЛЯТЬ!)"
echo ""
echo "Установленные linux-image:"
IMAGES_LIST="$(dpkg -l 2>/dev/null | awk '/^ii  linux-image-[0-9]+-[0-9]+-/ {print $2}' | sort -V || true)"
IMAGE_COUNT=$(echo "$IMAGES_LIST" | grep -c . || echo 0)
echo "$IMAGES_LIST" | awk '{print "  " NR". "$0}'
echo "  Всего: $IMAGE_COUNT шт."
echo ""
echo "Установленные linux-headers:"
HEADERS_LIST="$(dpkg -l 2>/dev/null | awk '/^ii  linux-headers-[0-9]+-[0-9]+-/ && $2 !~ /-common$/ {print $2}' | sort -V || true)"
HEADER_COUNT=$(echo "$HEADERS_LIST" | grep -c . || echo 0)
echo "$HEADERS_LIST" | awk '{print "  " NR". "$0}'
echo "  Всего: $HEADER_COUNT шт."
echo ""
echo "  Рекомендация: оставить running + 1 самое новое соседнее ядро на откат (всего 2 штуки)."
echo "  Старие сверх 2-х → safe delete."
OLD_IMAGES_COUNT=$((IMAGE_COUNT - 2))
OLD_HEADERS_COUNT=$((HEADER_COUNT - 2))
[[ "$OLD_IMAGES_COUNT"  -lt 0 ]] && OLD_IMAGES_COUNT=0
[[ "$OLD_HEADERS_COUNT" -lt 0 ]] && OLD_HEADERS_COUNT=0
echo "  Старых на удаление (image)  : $OLD_IMAGES_COUNT шт."
echo "  Старых на удаление (headers): $OLD_HEADERS_COUNT шт."

# kernels size per package
if [[ "$IMAGE_COUNT" -gt 0 ]]; then
  echo ""
  echo "  Размер каждого linux-image (Installed-Size из dpkg -s, KB):"
  while IFS= read -r pkg; do
    [[ -z "$pkg" ]] && continue
    SIZE_KB=$(dpkg-query -W -f='${Installed-Size}' "$pkg" 2>/dev/null || echo 0)
    echo "    $(printf "%8.1f MB" "$((SIZE_KB))" | awk '{printf "%.1f MB", $1/1024}')   $pkg"
  done <<< "$IMAGES_LIST"
fi

# snap
h2 "Snap-пакеты (snap list + snap list --all)"
if command -v snap >/dev/null 2>&1; then
  echo "snap version:"; snap version 2>/dev/null | head -n 3 || true
  echo ""
  echo "snap list --all (показывает disabled=old revisions):"
  snap list --all 2>/dev/null || true
  echo ""
  if [[ -d /var/lib/snapd/snaps ]]; then
    BYTES=$(du -sb /var/lib/snapd/snaps 2>/dev/null | awk '{print $1}')
    echo -n "/var/lib/snapd/snaps (образы .snap): "
    human_size_bytes "$BYTES"
    echo ""
    echo -n "/var/lib/snapd/cache:               "
    if [[ -d /var/lib/snapd/cache ]]; then
      BYTES=$(du -sb /var/lib/snapd/cache 2>/dev/null | awk '{print $1}')
      human_size_bytes "$BYTES"
      echo ""
    else
      echo " (пусто)"
    fi
  fi
else
  echo "  snap не установлен"
fi

# docker
h2 "Docker (images, containers, build cache, dangling)"
if command -v docker >/dev/null 2>&1; then
  echo "docker --version: $(docker --version 2>/dev/null || true)"
  echo ""
  echo "system df (verbose):"
  docker system df 2>/dev/null || echo "  docker daemon не запущен / нет доступа"
  echo ""
  echo "docker images -a | head -20:"
  docker images -a 2>/dev/null | head -n 20 || true
  echo ""
  echo "docker ps -a:"
  docker ps -a 2>/dev/null || true
else
  echo "  docker не установлен"
fi

# npm caches & logs per user
h2 "npm caches + _logs по пользователям (root + bot + APP_owner)"
declare -a NPM_USERS=(root)
if id bot >/dev/null 2>&1; then NPM_USERS+=(bot); fi
if [[ -d "$APP_DIR" ]]; then
  APP_OWNER="$(stat -c '%U' "$APP_DIR")"
  if ! printf '%s\n' "${NPM_USERS[@]}" | grep -qx "$APP_OWNER"; then
    NPM_USERS+=("$APP_OWNER")
  fi
fi
for u in "${NPM_USERS[@]}"; do
  echo ""
  echo "  пользователь: $u"
  USER_HOME="$(getent passwd "$u" 2>/dev/null | cut -d: -f6 || echo /home/$u)"
  echo "    home           : $USER_HOME"
  if [[ -d "${USER_HOME}/.npm/_logs" ]]; then
    BYTES=$(du -sb "${USER_HOME}/.npm/_logs" 2>/dev/null | awk '{print $1}')
    echo -n "    .npm/_logs     : "
    human_size_bytes "$BYTES"
    echo " (файлов: $(find "${USER_HOME}/.npm/_logs" -type f 2>/dev/null | wc -l))"
  fi
  if [[ -d "${USER_HOME}/.npm/_cacache" ]]; then
    BYTES=$(du -sb "${USER_HOME}/.npm/_cacache" 2>/dev/null | awk '{print $1}')
    echo -n "    .npm/_cacache  : "
    human_size_bytes "$BYTES"
    echo ""
  fi
done

# project heavy
h2 "Крупные папки внутри проекта ${APP_DIR} (node_modules, client/build, .git, tmp, uploads)"
for d in node_modules client/node_modules client/build .git tmp server/uploads files data; do
  p="${APP_DIR}/${d}"
  if [[ -e "$p" ]]; then
    BYTES=$(du -sb "$p" 2>/dev/null | awk '{print $1}')
    echo -n "  $d:"
    printf ' %.0s' {1..24}
    printf '\r  %-22s ' "$d"
    human_size_bytes "$BYTES"
    echo ""
  else
    echo "  $d:  (отсутствует)"
  fi
done

# ---------- SECTION 5: app health ----------
h1 "5. Проверка приложения Kaznadzei (информативно, ничего не трогает)"
h2 "systemctl status ${SERVICE_NAME}"
systemctl status "$SERVICE_NAME" --no-pager -l 2>/dev/null || echo "  (сервис $SERVICE_NAME не зарегистрирован systemd)"

h2 "/healthz curl: $HEALTHZ_URL"
if command -v curl >/dev/null 2>&1; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTHZ_URL" 2>/dev/null || echo 000)"
  BODY="$(curl -s --max-time 5 "$HEALTHZ_URL" 2>/dev/null || echo '')"
  echo "  HTTP код : $CODE"
  echo "  RESPONSE : $BODY"
  if [[ "$CODE" == "200" && "$BODY" == *'"ok":true'* ]]; then
    echo "  ИТОГ     : ✅ /healthz OK"
  else
    echo "  ИТОГ     : ⚠️  /healthz не OK (см. journalctl)"
  fi
else
  echo "  curl не установлен — проверка пропущена."
fi

h2 "node --check на server/**/*.js (exit-code только по каждому файлу)"
FAIL_NODECHECK=0
if [[ -d "${APP_DIR}/server" ]]; then
  FAIL_FILE="$(mktemp)"
  find "${APP_DIR}/server" -type f -name '*.js' -print0 2>/dev/null \
    | while IFS= read -r -d '' f; do
        rel="${f#${APP_DIR}/}"
        if node --check "$f" 2>/dev/null; then
          printf '  OK   %s\n' "$rel"
        else
          printf '  FAIL %s\n' "$rel" | tee -a "$FAIL_FILE" >/dev/null
        fi
      done
  if [[ -s "$FAIL_FILE" ]]; then
    FAIL_NODECHECK=$(wc -l < "$FAIL_FILE")
    echo ""
    echo "⚠️  Найдено FAIL: $FAIL_NODECHECK шт."
    cat "$FAIL_FILE"
  else
    echo ""
    echo "✅ Все server/**/*.js — syntax OK."
  fi
  rm -f "$FAIL_FILE"
else
  echo "  (${APP_DIR}/server не найден)"
fi

# ---------- SECTION 6: safe to delete recommendations ----------
h1 "6. Рекомендации: что БЕЗОПАСНО удалить"
h2 "Объяснение по категориям safe-delete"
echo "
  [S-1] apt clean /var/cache/apt/archives/*.deb        — всегда безопасно. Понадобятся → перекачает apt.
  [S-2] journalctl --vacuum-time=1d (или 1w)           — всегда безопасно, старые логи.
  [S-3] СТАРЫЕ ЯДРА (кроме текущего running + 1 самого нового) — безопасно после подтверждения, что
         новое ядро загрузилось и работает.
  [S-4] disabled snap revisions (snap remove --rev …)  — всегда безопасно, старые версии.
  [S-5] docker system prune -a (если контейнеры запущены → без -a; dangling+build cache безопасно)
  [S-6] npm cache clean --force для bot/root            — безопасно, локальный кэш tarball'ов.
  [S-7] ~/.npm/_logs/*.log (все кроме сегодня)           — безопасно.
  [S-8] /tmp/*.bak, *.log, *.tmp, *.cache              — безопасно после перезагрузки, или сейчас если
         kaznadzei/tmp точно пуст при выключенном сервере.
  [S-9] db.json.bak в ${APP_DIR} и старые backup файлы — безопасно при наличии живого db.json.
"

h2 "Список кандидаты safe-delete (с учётом ТЕКУЩЕГО состояния)"
: > "$SAFE_DELETE_LIST_FILE"
{
  echo "# КАТЕГОРИИ Safe-Delete (сгенерировано $(ts_now))"
  echo "# LOG_FILE = $LOG_FILE"
  echo ""
  echo "# [S-1] apt cache archives:"
  if [[ -d /var/cache/apt/archives ]]; then
    echo "du -sh /var/cache/apt/archives   # размер сейчас: $(du -sh /var/cache/apt/archives 2>/dev/null | awk '{print $1}')"
    echo "sudo apt clean   # освободить"
  fi
  echo ""
  echo "# [S-2] journal vacuum:"
  if command -v journalctl >/dev/null 2>&1; then
    echo "sudo journalctl --disk-usage   # сейчас:"
    journalctl --disk-usage 2>/dev/null | sed 's/^/   /' || true
    echo "sudo journalctl --vacuum-time=1d   # оставить 1 день"
  fi
  echo ""
  echo "# [S-3] старые ядра (оставляем running + 1 новый)."
  echo "# Running kernel = $RUNNING_FULL"
  echo "# Ранее посчитано старых image=$OLD_IMAGES_COUNT / headers=$OLD_HEADERS_COUNT."
  echo "dpkg -l | awk '/^ii  linux-image-[0-9]+-/ {print \$2}' | sort -V | head -n -2"
  echo "dpkg -l | awk '/^ii  linux-headers-[0-9]+-/ && \$2 !~ /-common$/ {print \$2}' | sort -V | head -n -2"
  echo "# Удалять через: sudo apt -y purge <список пакетов> ; sudo apt -y autoremove --purge"
  echo ""
  echo "# [S-4] snap disabled revisions:"
  if command -v snap >/dev/null 2>&1; then
    snap list --all 2>/dev/null | awk '/disabled/ {print "#   snap remove --revision", $3, $1}' || true
  fi
  echo ""
  echo "# [S-5] Docker dangling/cache (если Docker не используется — пропустить):"
  echo "#   docker system prune -f           # удалит остановленные контейнеры + dangling images/cache"
  echo "#   docker builder prune -f          # только build cache"
  echo ""
  echo "# [S-6, S-7] npm cache + logs per user:"
  for u in "${NPM_USERS[@]}"; do
    echo "sudo -u $u npm cache clean --force 2>/dev/null || true"
    USER_HOME="$(getent passwd "$u" 2>/dev/null | cut -d: -f6 || echo /home/$u)"
    if [[ -d "${USER_HOME}/.npm/_logs" ]]; then
      echo "find ${USER_HOME}/.npm/_logs -type f -mtime +0 -delete   # логи старше сегодня"
    fi
  done
  echo ""
  echo "# [S-8] /tmp и project /tmp, backup БД:"
  echo "find /tmp -maxdepth 3 -type f \\( -name '*.bak' -o -name '*backup*' -o -name '*.log' -o -name '*.tmp' \\) -delete"
  echo "find ${APP_DIR} -maxdepth 3 -type f -name 'db.json.bak' -delete"
  if [[ -d "${APP_DIR}/tmp" ]]; then
    echo "find ${APP_DIR}/tmp -maxdepth 3 -type f -delete"
  fi
  echo ""
  echo "# [S-9] Опционально: client build + client/node_modules — ВОССТАНОВЯТСЯ npm run build:"
  echo "  # du -sh ${APP_DIR}/client/build ${APP_DIR}/client/node_modules ${APP_DIR}/node_modules"
  echo "  # удалять только если сейчас нужны 1-2 ГБ срочно, потом npm install + npm run build вернёт."
} | tee -a "$SAFE_DELETE_LIST_FILE"

# ---------- SECTION 7: NEVER delete ----------
h1 "7. СПИСОК «НИКОГДА НЕ УДАЛЯТЬ» (для справки, если захотите удалять вручную)"
echo "
  ❌ /dev/mapper/*, /dev/sda*, /dev/loop*               — устройства ядра, rm = сломать ФС/сервер.
  ❌ /usr/*, /lib*, /lib64/*, /bin, /sbin, /etc/*       — системная ОС.
  ❌ /boot/vmlinuz-$(uname -r), initrd.img-$(uname -r) — текущее запущенное ядро.
  ❌ /opt/kaznadzei/db.json, data/, server/uploads/, files/  — данные проекта.
  ❌ /var/lib/systemd/*, /var/log/journal/*.journal    — systemd и логи аудита (нужно не rm, а vacuum).
  ❌ /etc/shadow, /etc/passwd, /etc/sudoers            — авторизация.
"

# ---------- SECTION 8: summary numbers ----------
h1 "8. Итоговые цифры (для сравнения после чистки)"
echo "  df -h / :"
df -h / | sed 's/^/   /'
echo ""
ROOT_AVAIL_KB="$(df -k / | awk 'NR==2 {print $4}')"
echo "  Свободно: $(human_size_bytes "$((ROOT_AVAIL_KB*1024))")  (${ROOT_AVAIL_KB} KB)"
echo ""
echo "  FAIL syntax *.js в server/ : $FAIL_NODECHECK шт."
echo ""
echo "  Архив с результатами сохранён:"
echo "    • $LOG_FILE"
echo "    • $SAFE_DELETE_LIST_FILE"
echo ""
echo "Завершено: $(ts_now)"
hr
