#!/usr/bin/env bash
set -euo pipefail

ROOT_MOUNT="${ROOT_MOUNT:-/}"
AUTO_INSTALL_TOOLS="${AUTO_INSTALL_TOOLS:-1}"

on_error() {
  local line_no="${1:-unknown}"
  echo ""
  echo "Ошибка: скрипт прерван на строке ${line_no}."
  echo "Проверь вывод выше. Если нужно, пришли его мне целиком — быстро дожмём."
}

trap 'on_error $LINENO' ERR

ensure_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Запусти скрипт через sudo:"
    echo "  sudo bash $(basename "$0")"
    exit 1
  fi
}

ensure_command() {
  local command_name="$1"
  local install_hint="${2:-}"
  if command -v "$command_name" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$AUTO_INSTALL_TOOLS" == "1" && "$command_name" == "growpart" ]] && command -v apt-get >/dev/null 2>&1; then
    echo "Команда growpart не найдена, устанавливаю cloud-guest-utils..."
    apt-get update -y
    apt-get install -y cloud-guest-utils
    if command -v "$command_name" >/dev/null 2>&1; then
      return 0
    fi
  fi

  echo "Ошибка: команда '${command_name}' не найдена."
  if [[ -n "$install_hint" ]]; then
    echo "$install_hint"
  fi
  exit 1
}

trim() {
  awk '{$1=$1; print}'
}

show_layout() {
  echo ""
  echo "[layout] lsblk"
  lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT
  echo ""
  echo "[layout] pvs"
  pvs || true
  echo ""
  echo "[layout] vgs"
  vgs || true
  echo ""
  echo "[layout] lvs"
  lvs || true
  echo ""
  echo "[layout] df -h ${ROOT_MOUNT}"
  df -h "${ROOT_MOUNT}"
}

ensure_root
ensure_command findmnt
ensure_command lsblk
ensure_command lvs "Установи пакет lvm2 и повтори попытку."
ensure_command pvs "Установи пакет lvm2 и повтори попытку."
ensure_command vgs "Установи пакет lvm2 и повтори попытку."
ensure_command pvresize "Установи пакет lvm2 и повтори попытку."
ensure_command lvextend "Установи пакет lvm2 и повтори попытку."
ensure_command growpart "Установи пакет cloud-guest-utils и повтори попытку."
ensure_command partprobe "Установи пакет parted и повтори попытку."
ensure_command awk

echo "============================================"
echo " Расширение диска Kaznadzei / Ubuntu LVM"
echo "============================================"
echo "Точка монтирования: ${ROOT_MOUNT}"

ROOT_SOURCE="$(findmnt -n -o SOURCE "${ROOT_MOUNT}" | tr -d '[:space:]')"
if [[ -z "${ROOT_SOURCE}" ]]; then
  echo "Ошибка: не удалось определить устройство для ${ROOT_MOUNT}."
  exit 1
fi

if [[ "${ROOT_SOURCE}" != /dev/mapper/* && "${ROOT_SOURCE}" != /dev/*/* ]]; then
  echo "Ошибка: корневой том '${ROOT_SOURCE}' не похож на LVM logical volume."
  echo "Скрипт рассчитан на Ubuntu с root на LVM."
  exit 1
fi

ROOT_LV_PATH="${ROOT_SOURCE}"
ROOT_LV_REALPATH="$(readlink -f "${ROOT_SOURCE}")"
ROOT_VG_NAME="$(lvs --noheadings -o vg_name "${ROOT_LV_PATH}" 2>/dev/null | trim || true)"
ROOT_LV_NAME="$(lvs --noheadings -o lv_name "${ROOT_LV_PATH}" 2>/dev/null | trim || true)"

if [[ -z "${ROOT_VG_NAME}" || -z "${ROOT_LV_NAME}" ]]; then
  echo "Ошибка: не удалось определить VG/LV для '${ROOT_LV_PATH}'."
  echo "Проверка:"
  lvs || true
  exit 1
fi

mapfile -t ROOT_PVS < <(pvs --noheadings -o pv_name,vg_name --separator '|' 2>/dev/null \
  | awk -F'|' -v target_vg="${ROOT_VG_NAME}" '
      {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1);
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2);
        if ($2 == target_vg) print $1;
      }')

if [[ "${#ROOT_PVS[@]}" -ne 1 ]]; then
  echo "Ошибка: найдено ${#ROOT_PVS[@]} PV для VG '${ROOT_VG_NAME}'."
  echo "Этот скрипт безопасно работает только с одним PV. Текущие PV:"
  printf '  - %s\n' "${ROOT_PVS[@]}"
  exit 1
fi

ROOT_PV_PATH="$(readlink -f "${ROOT_PVS[0]}")"
ROOT_PV_TYPE="$(lsblk -n -o TYPE "${ROOT_PV_PATH}" | head -n 1 | tr -d '[:space:]')"

if [[ "${ROOT_PV_TYPE}" != "part" ]]; then
  echo "Ошибка: PV '${ROOT_PV_PATH}' имеет тип '${ROOT_PV_TYPE:-unknown}', а не 'part'."
  echo "Скрипт рассчитан на стандартную схему /dev/sda3 -> LVM."
  exit 1
fi

PARENT_DISK_NAME="$(lsblk -n -o PKNAME "${ROOT_PV_PATH}" | head -n 1 | tr -d '[:space:]')"
PARTITION_NUMBER="$(lsblk -n -o PARTN "${ROOT_PV_PATH}" | head -n 1 | tr -d '[:space:]')"

if [[ -z "${PARENT_DISK_NAME}" || -z "${PARTITION_NUMBER}" ]]; then
  echo "Ошибка: не удалось определить диск/номер раздела для '${ROOT_PV_PATH}'."
  exit 1
fi

PARENT_DISK_PATH="/dev/${PARENT_DISK_NAME}"

echo ""
echo "[preflight]"
echo "  root source : ${ROOT_SOURCE}"
echo "  root lv     : ${ROOT_LV_PATH}"
echo "  root real   : ${ROOT_LV_REALPATH}"
echo "  vg/lv       : ${ROOT_VG_NAME}/${ROOT_LV_NAME}"
echo "  pv          : ${ROOT_PV_PATH}"
echo "  disk        : ${PARENT_DISK_PATH}"
echo "  partition   : ${PARTITION_NUMBER}"
show_layout

echo ""
echo "[1/5] Обновляю таблицу устройства"
echo 1 > "/sys/class/block/${PARENT_DISK_NAME}/device/rescan"
partprobe "${PARENT_DISK_PATH}" || true

echo "[2/5] Расширяю раздел ${ROOT_PV_PATH}"
GROWPART_LOG="$(mktemp)"
if growpart "${PARENT_DISK_PATH}" "${PARTITION_NUMBER}" >"${GROWPART_LOG}" 2>&1; then
  cat "${GROWPART_LOG}"
else
  cat "${GROWPART_LOG}"
  if grep -qi "NOCHANGE" "${GROWPART_LOG}"; then
    echo "growpart: раздел уже занимает всё доступное место, продолжаю."
  else
    rm -f "${GROWPART_LOG}"
    echo "Ошибка: growpart завершился с ошибкой."
    exit 1
  fi
fi
rm -f "${GROWPART_LOG}"
partprobe "${PARENT_DISK_PATH}" || true

echo "[3/5] Обновляю размер PV"
pvresize "${ROOT_PV_PATH}"

VG_FREE_RAW="$(vgs --noheadings -o vg_free --units m --nosuffix "${ROOT_VG_NAME}" 2>/dev/null | trim)"

echo "[4/5] Свободно в VG после pvresize: ${VG_FREE_RAW:-0} MiB"
if awk -v value="${VG_FREE_RAW:-0}" 'BEGIN { exit !(value + 0 > 1) }'; then
  echo "[5/5] Расширяю root LV на всё свободное место"
  lvextend -l +100%FREE -r "${ROOT_LV_PATH}"
else
  echo "[5/5] Дополнительного места в VG не появилось, lvextend не требуется"
fi

echo ""
echo "============================================"
echo " Готово"
echo "============================================"
show_layout
