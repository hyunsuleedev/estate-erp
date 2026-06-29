type DesktopUpdateStatus =
  | { state: 'disabled'; currentVersion: string; reason: string; startedAt: number }
  | { state: 'idle'; currentVersion: string; startedAt: number }
  | { state: 'checking'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'available'; currentVersion: string; version?: string; releaseName?: string; manual?: boolean; startedAt: number }
  | { state: 'not-available'; currentVersion: string; manual?: boolean; startedAt: number }
  | { state: 'downloaded'; currentVersion: string; version?: string; releaseName?: string; releaseNotes?: string; startedAt: number }
  | { state: 'error'; currentVersion: string; message: string; manual?: boolean; startedAt: number };

export type UpdatePromptAction = 'check' | 'restart' | 'dismiss';

export interface UpdatePromptModel {
  variant: 'silent' | 'banner' | 'modal';
  title: string;
  detail: string;
  primaryAction?: UpdatePromptAction;
  secondaryAction?: UpdatePromptAction;
  progressLabel?: string;
}

export function getUpdatePromptModel(status: DesktopUpdateStatus): UpdatePromptModel {
  switch (status.state) {
    case 'available':
      return {
        variant: 'banner',
        title: '업데이트 다운로드 중',
        detail: `${getTargetVersion(status)} 버전을 백그라운드에서 준비하고 있습니다.`,
        progressLabel: '다운로드 중',
      };
    case 'downloaded':
      return {
        variant: 'modal',
        title: '업데이트 준비 완료',
        detail: `${getTargetVersion(status)} 버전을 적용하려면 앱을 재시작하세요.`,
        primaryAction: 'restart',
        secondaryAction: 'dismiss',
      };
    case 'not-available':
      return status.manual
        ? {
            variant: 'banner',
            title: '최신 버전입니다',
            detail: `현재 ${status.currentVersion} 버전을 사용 중입니다.`,
            secondaryAction: 'dismiss',
          }
        : silentModel();
    case 'error':
      return status.manual
        ? {
            variant: 'banner',
            title: '업데이트 확인 실패',
            detail: `네트워크 상태를 확인한 뒤 다시 시도하세요. ${status.message}`,
            primaryAction: 'check',
            secondaryAction: 'dismiss',
          }
        : silentModel();
    case 'disabled':
    case 'idle':
    case 'checking':
    default:
      return silentModel();
  }
}

export function shouldShowUpdatePrompt(model: UpdatePromptModel) {
  return model.variant !== 'silent';
}

function silentModel(): UpdatePromptModel {
  return {
    variant: 'silent',
    title: '',
    detail: '',
  };
}

function getTargetVersion(status: Extract<DesktopUpdateStatus, { state: 'available' | 'downloaded' }>) {
  return status.version ?? status.releaseName ?? '새';
}

