import type { CtiLookupResult, IngestCallEventResult } from '@estate-erp/api-client';
import type { SessionApiClient } from '../api/sessionApiClient';
import type { CallControllerApi } from './callController';

/** 통화 흐름이 쓰는 서버 API. 화면이 쓰는 api-client의 cti 모듈과 같은 주소다. */
export function createCtiApi(client: SessionApiClient): CallControllerApi {
  return {
    ingestCallEvent: (sessionId, event) =>
      client.request<IngestCallEventResult>(sessionId, '/cti/call-events', {
        method: 'POST',
        body: event,
      }),
    lookup: (sessionId, phone) =>
      client.request<CtiLookupResult>(sessionId, '/cti/lookup', {
        params: { phone },
      }),
  };
}
