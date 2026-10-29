/**
 * Bridge between React frontend and Python desktop backend (PyWebView).
 */

interface PyWebViewApi {
  invoke?: (command: string, args?: Record<string, any>) => Promise<any>;
  select_output_directory?: () => Promise<string | null>;
  open_file_dialog?: () => Promise<string | null>;
  [command: string]: any;
}

declare global {
  interface Window {
    pywebview?: {
      api?: PyWebViewApi;
    };
  }
}

async function getPyWebViewApi(): Promise<PyWebViewApi | null> {
  if (typeof window === "undefined") return null;

  if (window.pywebview?.api) {
    return window.pywebview.api;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const onReady = () => {
      if (!resolved) {
        resolved = true;
        resolve(window.pywebview?.api || null);
      }
    };

    window.addEventListener("pywebviewready", onReady, { once: true });

    const interval = setInterval(() => {
      if (window.pywebview?.api) {
        clearInterval(interval);
        if (!resolved) {
          resolved = true;
          resolve(window.pywebview.api);
        }
      }
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      if (!resolved) {
        resolved = true;
        resolve(window.pywebview?.api || null);
      }
    }, 12000);
  });
}

export async function invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
  const pyApi = await getPyWebViewApi();
  if (pyApi) {
    if (typeof pyApi.invoke === "function") {
      return (await pyApi.invoke(command, args || {})) as T;
    }
    if (typeof pyApi[command] === "function") {
      return (await pyApi[command](args || {})) as T;
    }
  }

  throw new Error(`Comando '${command}' no pudo ejecutarse: no se detectó el backend de PyWebView.`);
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

export async function open(options?: OpenDialogOptions): Promise<string | null> {
  const pyApi = await getPyWebViewApi();
  if (pyApi) {
    if (options?.directory) {
      if (typeof pyApi.select_output_directory === "function") {
        return await pyApi.select_output_directory();
      }
      if (typeof pyApi.invoke === "function") {
        return await pyApi.invoke("select_output_directory", {});
      }
    }
    if (typeof pyApi.open_file_dialog === "function") {
      return await pyApi.open_file_dialog();
    }
    if (typeof pyApi.invoke === "function") {
      return await pyApi.invoke("open_file_dialog", {});
    }
  }

  return null;
}

export async function listen<T = any>(
  eventName: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const customListener = (e: Event) => {
    const custom = e as CustomEvent<T>;
    handler({ payload: custom.detail });
  };

  window.addEventListener(eventName, customListener);

  return () => {
    window.removeEventListener(eventName, customListener);
  };
}
