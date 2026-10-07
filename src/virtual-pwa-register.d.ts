declare module "virtual:pwa-register" {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onRegistered?: (swUrl: string | ServiceWorker | undefined) => void;
    onRegisterError?: (err: unknown) => void;
    // additional options may be provided by the plugin
    [key: string]: unknown;
  };

  /**
   * registerSW returns a function that triggers an update when called.
   * The actual implementation is injected by vite-plugin-pwa at build/runtime.
   */
  export function registerSW(opts?: RegisterSWOptions): () => Promise<void>;

  export default registerSW;
}
