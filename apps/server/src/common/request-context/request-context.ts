import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestSource = 'web' | 'mcp' | 'system';

export interface RequestContextStore {
  source: RequestSource;
  actor: 'user' | 'mcp:claude' | 'system:rule_engine';
  userId?: string;
  officeId?: string;
  role?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function runWithRequestContext<T>(
  context: RequestContextStore,
  callback: () => T,
) {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext() {
  return requestContextStorage.getStore();
}

export function setRequestContext(values: Partial<RequestContextStore>) {
  const store = requestContextStorage.getStore();

  if (!store) {
    return;
  }

  Object.assign(store, values);
}
