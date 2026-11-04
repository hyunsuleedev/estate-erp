# Estate ERP

부동산 중개사 업무를 위한 NestJS 서버와 Electron 데스크톱 앱입니다.
일반 사용자가 매물을 탐색하는 웹사이트는 [estate-catalog](https://github.com/hyunsuleedev/estate-catalog)에서 별도로 관리합니다.

## 개발

Node.js 23 이상과 pnpm을 사용합니다. 구조와 개발 명령은 [AGENTS.md](AGENTS.md), 데이터 모델은 [docs/DATA_STRUCTURE.md](docs/DATA_STRUCTURE.md)를 참고하세요.

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm dev:server
pnpm dev:desktop
```

환경변수 예시는 `apps/server/.env.example`에 있습니다. 실제 자격증명은 커밋하지 마세요.

### Docker 백엔드

`apps/server/.env`를 준비한 뒤 API, PostgreSQL, Redis를 함께 실행합니다. 서버가 시작될 때 로컬 DB 마이그레이션을 적용하며, 기존 데이터 볼륨은 유지합니다.

```sh
docker compose -f docker-compose.dev.yml -f docker-compose.backend.yml up -d --build
```

API 문서는 `http://localhost:3001/api-docs`에서 확인할 수 있습니다. 데스크톱의 `apps/desktop/.env.local`에 `VITE_API_BASE_URL=http://localhost:3001`을 설정하고 `pnpm dev:desktop`을 실행하세요.

## 공개용 이력

이 저장소는 원본에서 개발 캡처, 외부 앱 분석 토큰, 덤프 등을 제외한 Git 이력을 사용합니다. 원본의 비공개 이슈, PR, Actions 실행 로그는 포함하지 않습니다.
기존 비공개 체크아웃을 이 저장소에 mirror push하거나 병합하면 제거한 자료가 다시 들어올 수 있습니다. 이 저장소를 새로 clone하고 필요한 코드 변경만 옮기세요.

기존 `apps/catalog`는 분리 당시 소스로 남겨 두었습니다. 공개 웹사이트의 후속 변경은 별도 저장소에서 진행합니다.
AWS 배포 연결은 아직 이전되지 않았으며, 새 저장소의 자동 배포는 비활성화되어 있습니다.

보안 관련 안내는 [SECURITY.md](SECURITY.md)를 참고하세요.

### 사무소 주소

사무소 생성과 설정에서 Kakao 우편번호 검색으로 주소를 선택하고 상세주소를 입력합니다. 주소는 선택 사항이며 도로명·지번·우편번호·건물관리번호·상세주소를 분리 저장합니다. 기존 `address`는 표시용으로 함께 유지하며 기존 자유입력 주소는 재선택 전까지 그대로 보존합니다. 법정동 FK는 추가하지 않습니다.

서버의 `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET`을 설정하면 저장 후 네이버 Geocoding으로 위경도와 PostGIS 5179 좌표를 확인합니다. 좌표 조회는 주소 저장 트랜잭션 이후 최대 5초 동안 실행하며, 실패해도 주소는 저장됩니다. 기본주소 변경·삭제 시 기존 좌표를 비우고, 상세주소만 바꾸면 좌표를 유지합니다. 설정 화면의 **위치 다시 확인** 또는 owner/manager 전용 `POST /offices/me/geocode`로 재시도할 수 있습니다. 키 미설정·조회 실패 주소는 위치 확인 완료로 취급하지 않습니다. 근처 사무소에 매물요청을 보내는 거리 기반 배정은 별도 구현 대상입니다.

로컬 Docker 백엔드는 `docker compose -f docker-compose.dev.yml -f docker-compose.backend.yml up -d --build server`로 갱신합니다. 시작 시 주소 필드 추가 마이그레이션도 적용됩니다.
