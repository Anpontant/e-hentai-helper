import { vi } from 'vitest';

interface StorageData {
  [key: string]: unknown;
}

let storageData: StorageData = {};

export const browserMock = {
  storage: {
    local: {
      get: vi.fn((defaults?: StorageData) => {
        return Promise.resolve({ ...defaults, ...storageData });
      }),
      set: vi.fn((items: StorageData) => {
        Object.assign(storageData, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((k) => delete storageData[k]);
        return Promise.resolve();
      })
    }
  },
  i18n: {
    getMessage: vi.fn((key: string) => key)
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: '0.0.0-test' }))
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    sendMessage: vi.fn(() => Promise.resolve(null))
  },
  windows: {
    getCurrent: vi.fn(() => Promise.resolve({ id: 1, state: 'normal' })),
    update: vi.fn(() => Promise.resolve({}))
  }
};

export function resetBrowserMock() {
  storageData = {};
  browserMock.storage.local.get.mockImplementation((defaults?: StorageData) => {
    return Promise.resolve({ ...defaults, ...storageData });
  });
  browserMock.storage.local.set.mockImplementation((items: StorageData) => {
    Object.assign(storageData, items);
    return Promise.resolve();
  });
  browserMock.storage.local.remove.mockImplementation((keys: string | string[]) => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach((k) => delete storageData[k]);
    return Promise.resolve();
  });
}

Object.defineProperty(globalThis, 'browser', {
  value: browserMock,
  writable: true,
  configurable: true
});
