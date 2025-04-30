// Extensión de tipos para env.ts
// Para ser importado en el archivo original

declare module '../utils/env' {
  interface Env {
    // Parámetros de Telegram 
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_AUTHORIZED_USERS: string;
    TELEGRAM_ADMIN_USERS: string;
    TELEGRAM_ACCESS_CODE?: string;
  }
}

export {};
