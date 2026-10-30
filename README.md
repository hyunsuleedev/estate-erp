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

## 공개용 이력

이 저장소는 원본에서 개발 캡처, 외부 앱 분석 토큰, 덤프 등을 제외한 Git 이력을 사용합니다. 원본의 비공개 이슈, PR, Actions 실행 로그는 포함하지 않습니다.
기존 비공개 체크아웃을 이 저장소에 mirror push하거나 병합하면 제거한 자료가 다시 들어올 수 있습니다. 이 저장소를 새로 clone하고 필요한 코드 변경만 옮기세요.

기존 `apps/catalog`는 분리 당시 소스로 남겨 두었습니다. 공개 웹사이트의 후속 변경은 별도 저장소에서 진행합니다.
AWS 배포 연결은 아직 이전되지 않았으며, 새 저장소의 자동 배포는 비활성화되어 있습니다.

보안 관련 안내는 [SECURITY.md](SECURITY.md)를 참고하세요.
