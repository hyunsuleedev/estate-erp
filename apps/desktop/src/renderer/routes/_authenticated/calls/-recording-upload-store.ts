import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';

/**
 * 올리는 중인 녹음.
 *
 * 녹음 파일은 크고(수십 MB) 올리는 데 시간이 걸린다. 올리기 창을 붙잡아 두지 않고 바로 닫은 뒤,
 * 상담분석 표에 "올리는 중"인 줄로 보인다. 다 올라가면 서버의 줄(받아쓰는 중 …)이 그 자리를 잇는다.
 * 실패하면 줄이 남아 다시 올리거나 지울 수 있다 — 조용히 사라지지 않는다.
 *
 * 이 목록은 화면 메모리에만 있다. 올리는 중에 앱을 닫으면 그 녹음은 올라가지 않는다.
 */
export interface RecordingUpload {
  id: string;
  file: File;
  fileName: string;
  /** 전화 통화 / 방문 상담 */
  kind: 'phone' | 'visit';
  direction: 'inbound' | 'outbound';
  /** 숫자만 */
  phoneNumber: string;
  /** ISO. 통화·상담한 시각 */
  calledAt: string;
  durationSec: number | null;
  /** 이미 적어 둔 상담에 붙이는 경우 그 상담 */
  attachTo: { id: string; contactName: string } | null;
  status: 'uploading' | 'failed';
  error: string | null;
  startedAt: number;
}

export type RecordingUploadInput = Omit<RecordingUpload, 'id' | 'status' | 'error' | 'startedAt' | 'fileName'>;

interface RecordingUploadState {
  uploads: RecordingUpload[];
  start: (input: RecordingUploadInput, queryClient: QueryClient) => string;
  retry: (id: string, queryClient: QueryClient) => void;
  dismiss: (id: string) => void;
}

function errorText(error: unknown) {
  return apiErrorMessage(error, '녹음을 올리지 못했습니다. 다시 올려 주세요.');
}

async function send(upload: RecordingUpload) {
  if (upload.attachTo) {
    await api.consultations.attachRecording(upload.attachTo.id, {
      file: upload.file,
      durationSec: upload.durationSec ?? undefined,
      calledAt: upload.calledAt,
      direction: upload.kind === 'phone' ? upload.direction : undefined,
    });
    return;
  }
  await api.consultations.createWithRecording({
    file: upload.file,
    type: upload.kind,
    direction: upload.kind === 'visit' ? undefined : upload.direction,
    phoneNumber: upload.phoneNumber || undefined,
    calledAt: upload.calledAt,
    durationSec: upload.durationSec ?? undefined,
  });
}

const UPLOAD_MARKER_ATTRIBUTE = 'data-recording-uploading';

/**
 * 올리는 중에는 이 탭이 "저장하지 않은 작업이 있다"고 알린다.
 * 탭 화면은 메모리가 모자라면 버려질 수 있고 사용자가 닫을 수도 있는데, 그러면 올리던 요청이 조용히 끊긴다.
 * 탭 관리가 보는 표식을 문서에 붙여 둔다: 화면을 버리지 않고(dirty), 탭 닫기도 막는다(transfer —
 * main의 탭 목록이 닫지 않고 "올리는 중"이라고 알린다).
 * (예전에는 올리기 창의 mutation이 같은 보호를 받았다 — 창을 닫고 뒤에서 올리면서 빠졌던 것을 되살린다.)
 * 표식은 화면 부품이 아니라 저장소가 관리한다: 다른 화면으로 옮겨 가도 올리기는 계속되기 때문이다.
 */
function syncUploadMarker(uploads: readonly RecordingUpload[]) {
  if (typeof document === 'undefined') return;
  const uploading = uploads.some((upload) => upload.status === 'uploading');
  const existing = document.querySelector(`[${UPLOAD_MARKER_ATTRIBUTE}]`);
  if (uploading && !existing) {
    const marker = document.createElement('span');
    marker.hidden = true;
    marker.setAttribute(UPLOAD_MARKER_ATTRIBUTE, '');
    // dirty: 화면을 버리거나 다른 화면으로 바꾸지 않는다 / transfer: 탭을 닫지 못하게 한다
    marker.setAttribute('data-native-tab-dirty', 'true');
    marker.setAttribute('data-native-tab-transfer', 'true');
    document.body.appendChild(marker);
  } else if (!uploading && existing) {
    existing.remove();
  }
}

export const useRecordingUploadStore = create<RecordingUploadState>((rawSet, get) => {
  // 목록이 바뀔 때마다 표식을 맞춘다
  const set: typeof rawSet = (...args) => {
    rawSet(...(args as Parameters<typeof rawSet>));
    syncUploadMarker(get().uploads);
  };
  const run = (id: string, queryClient: QueryClient) => {
    const upload = get().uploads.find((item) => item.id === id);
    if (!upload) return;
    void send(upload).then(
      async () => {
        // 서버의 줄을 먼저 불러온 뒤에 "올리는 중" 줄을 지운다 (그 사이 표에서 사라졌다 나타나지 않게)
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['call-recordings'] }),
          queryClient.invalidateQueries({ queryKey: ['consultations'] }),
          queryClient.invalidateQueries({ queryKey: ['consultation'] }),
        ]);
        set((state) => ({ uploads: state.uploads.filter((item) => item.id !== id) }));
      },
      async (error: unknown) => {
        // 응답만 못 받았을 뿐 서버에는 올라갔을 수 있다 (시간 초과 등). 목록을 새로 불러와
        // 실제로 붙었으면 화면이 그 상태를 보이게 한다 — 실패 표시가 사실과 어긋난 채 남지 않게.
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['call-recordings'] }),
          queryClient.invalidateQueries({ queryKey: ['consultations'] }),
          queryClient.invalidateQueries({ queryKey: ['consultation'] }),
        ]);
        set((state) => ({
          uploads: state.uploads.map((item) =>
            item.id === id ? { ...item, status: 'failed' as const, error: errorText(error) } : item,
          ),
        }));
      },
    );
  };

  return {
    uploads: [],
    start: (input, queryClient) => {
      const id = crypto.randomUUID();
      set((state) => ({
        uploads: [
          ...state.uploads,
          { ...input, id, fileName: input.file.name, status: 'uploading', error: null, startedAt: Date.now() },
        ],
      }));
      run(id, queryClient);
      return id;
    },
    retry: (id, queryClient) => {
      const upload = get().uploads.find((item) => item.id === id);
      // 올리는 중인 것을 또 보내면 녹음이 두 번 생긴다
      if (!upload || upload.status !== 'failed') return;
      set((state) => ({
        uploads: state.uploads.map((item) =>
          item.id === id ? { ...item, status: 'uploading' as const, error: null } : item,
        ),
      }));
      run(id, queryClient);
    },
    dismiss: (id) =>
      set((state) => ({
        // 올리는 중인 것은 지울 수 없다 (요청은 이미 나갔다 — 줄만 지우면 올라간 줄 모르게 된다)
        uploads: state.uploads.filter((item) => item.id !== id || item.status === 'uploading'),
      })),
  };
});
