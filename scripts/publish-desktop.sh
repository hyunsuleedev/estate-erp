#!/usr/bin/env bash
# 데스크톱 앱 배포: 설치 파일을 만들어 Cloudflare R2(자동 업데이트 주소)에 올린다.
#
#   ./scripts/publish-desktop.sh            이 기기의 운영체제용 설치 파일을 만들고 올린다
#   ./scripts/publish-desktop.sh --upload   이미 만든 apps/desktop/dist/ 를 올리기만 한다
#   ./scripts/publish-desktop.sh --dry-run  만들기만 하고 올릴 파일 목록을 보여 준다
#
# 설치된 앱은 {업데이트 주소}/latest-mac.yml(macOS) · latest.yml(Windows)을 읽어 새 버전을 찾고,
# 거기 적힌 파일을 같은 폴더에서 내려받는다(apps/desktop/src/main/updaterService.ts). 그래서
#   1) 설치 파일을 먼저 올리고 목록(yml)을 맨 나중에 올린다 — 목록이 없는 파일을 가리키지 않게.
#   2) 버전(apps/desktop/package.json의 version)을 올린 뒤에 실행한다. 같은 버전을 다시 올리면
#      이미 설치된 앱은 업데이트로 보지 않는다.
#
# macOS는 서명한 앱만 자동 업데이트가 된다. ESTATE_ERP_MAC_IDENTITY(서명 인증서 이름)를 주고 실행한다.
# Windows 설치 파일은 Windows에서 만든다(.github/workflows/build-desktop-windows.yml). 그 워크플로가
# "업데이트 주소에 올린다"를 켠 실행에서 이 스크립트의 --upload로 올린다. Cloudflare에는 wrangler로
# 올리므로 `wrangler login`이 돼 있거나 CLOUDFLARE_API_TOKEN · CLOUDFLARE_ACCOUNT_ID가 있어야 한다.
set -euo pipefail

cd "$(dirname "$0")/.."

BUCKET="${ESTATE_ERP_RELEASE_BUCKET:-estaitflow-releases}"
PREFIX="${ESTATE_ERP_RELEASE_PREFIX:-desktop}"
UPDATE_BASE_URL="${ESTATE_ERP_UPDATE_BASE_URL:-https://releases.estaitt.com/$PREFIX}"
API_BASE_URL="${VITE_API_BASE_URL_FOR_RELEASE:-https://api.estaitt.com}"
DIST="apps/desktop/dist"

MODE="build"
case "${1:-}" in
  "") ;;
  --upload) MODE="upload" ;;
  --dry-run) MODE="dry-run" ;;
  *) echo "모르는 옵션: $1" >&2; exit 1 ;;
esac

VERSION="$(node -p "require('./apps/desktop/package.json').version")"

if [ "$MODE" != "upload" ]; then
  if [ "$(uname)" = "Darwin" ] && [ -z "${ESTATE_ERP_MAC_IDENTITY:-}" ]; then
    echo "주의: ESTATE_ERP_MAC_IDENTITY가 없어 서명하지 않습니다. 서명하지 않은 macOS 앱은 자동 업데이트가 되지 않습니다." >&2
  fi
  echo "== 설치 파일 만들기 (버전 $VERSION, 서버 $API_BASE_URL, 업데이트 주소 $UPDATE_BASE_URL) =="
  rm -rf "$DIST"
  # 설치 파일에 들어갈 서버 주소와 업데이트 주소는 빌드할 때 정해진다. 개발용 .env.local의 값보다 이 값이 앞선다.
  VITE_API_BASE_URL="$API_BASE_URL" ESTATE_ERP_UPDATE_BASE_URL="$UPDATE_BASE_URL" \
    pnpm --filter @estate-erp/desktop make
fi

[ -d "$DIST" ] || { echo "$DIST 가 없습니다. 먼저 설치 파일을 만드세요." >&2; exit 1; }

# 올릴 것: 설치 파일(dmg · zip · exe)과 그 조각 목록(blockmap), 그리고 업데이트 목록(yml).
FILES=()
while IFS= read -r file; do FILES+=("$file"); done < <(find "$DIST" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.zip' -o -name '*.exe' -o -name '*.blockmap' \) | sort)
FEEDS=()
while IFS= read -r file; do FEEDS+=("$file"); done < <(find "$DIST" -maxdepth 1 -type f -name 'latest*.yml' | sort)

if [ ${#FILES[@]} -eq 0 ] || [ ${#FEEDS[@]} -eq 0 ]; then
  echo "$DIST 에 설치 파일이나 업데이트 목록(latest*.yml)이 없습니다. 업데이트 주소 없이 만든 빌드일 수 있습니다." >&2
  exit 1
fi

echo "== 올릴 파일 (r2://$BUCKET/$PREFIX/) =="
for file in "${FILES[@]}" "${FEEDS[@]}"; do printf '  %s  %s\n' "$(du -h "$file" | cut -f1)" "$(basename "$file")"; done

if [ "$MODE" = "dry-run" ]; then
  echo "(--dry-run: 올리지 않았습니다)"
  exit 0
fi

put() {
  local file="$1" cache="$2" type
  case "$file" in
    *.yml) type="text/yaml" ;;
    *.dmg) type="application/x-apple-diskimage" ;;
    *.zip) type="application/zip" ;;
    *.exe) type="application/vnd.microsoft.portable-executable" ;;
    *) type="application/octet-stream" ;;
  esac
  wrangler r2 object put "$BUCKET/$PREFIX/$(basename "$file")" --file "$file" --remote \
    --content-type "$type" --cache-control "$cache" >/dev/null
  echo "  올림: $(basename "$file")"
}

echo "== 설치 파일 올리기 =="
# 버전이 이름에 들어 있어 내용이 바뀌지 않는다 — 오래 캐시해도 된다.
for file in "${FILES[@]}"; do put "$file" "public, max-age=31536000, immutable"; done

echo "== 업데이트 목록 올리기 (맨 나중) =="
# 목록은 버전마다 같은 이름으로 덮어쓴다 — 캐시하면 새 버전을 늦게 본다.
for file in "${FEEDS[@]}"; do put "$file" "no-cache, max-age=0"; done

echo
echo "배포 끝: 버전 $VERSION"
for file in "${FEEDS[@]}"; do echo "  $UPDATE_BASE_URL/$(basename "$file")"; done
