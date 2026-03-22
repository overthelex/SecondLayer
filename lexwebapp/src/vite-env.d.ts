/// <reference types="vite/client" />

interface Window {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_MCP_API_BASE_URL?: string
  readonly VITE_MCP_API_KEY?: string
  readonly VITE_ENABLE_DEVTOOLS?: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
