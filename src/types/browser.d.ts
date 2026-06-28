declare namespace browser {
  namespace storage {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const local: {
      get(defaults: any): Promise<any>;
      set(patch: any): Promise<void>;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function query(opts: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }

  namespace runtime {
    interface MessageEvent {
      target?: string;
      type?: string;
    }
    const onMessage: {
      addListener(callback: (message: MessageEvent) => Promise<{ ok: boolean }> | undefined): void;
    };
    function getManifest(): { version: string };
  }

  namespace i18n {
    function getMessage(key: string, substitutions?: string | string[]): string;
  }

  namespace windows {
    interface BrowserWindow {
      id: number;
      state?: string;
    }
    function getCurrent(): Promise<BrowserWindow>;
    function update(windowId: number, updateInfo: { state: string }): Promise<BrowserWindow>;
  }
}
