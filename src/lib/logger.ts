/**
 * Merkezi Hata Loglama Modülü
 * 
 * Production'da → Sentry'ye gönderir (console temiz kalır)
 * Development'ta → Sentry + console.error (debug için)
 * 
 * Kullanım:
 *   import { logError, logWarn } from "../lib/logger";
 *   
 *   catch (err) {
 *     logError(err, "Puantaj", "kaydet");
 *     alert("Kaydedilemedi!");
 *   }
 */
import * as Sentry from "@sentry/react";

const isDev = import.meta.env.DEV;

/**
 * Hata logla — Sentry'ye gönderir + dev'de console'a yazar
 * 
 * @param error  Hata objesi
 * @param module Modül adı (Puantaj, Gorevler, Home vb.)
 * @param action Yapılan işlem (kaydet, sil, yukle vb.)
 * @param extra  Ek bilgiler (opsiyonel)
 */
export function logError(
  error: unknown,
  module: string,
  action?: string,
  extra?: Record<string, unknown>
): void {
  Sentry.captureException(error, {
    tags: { module, ...(action ? { action } : {}) },
    ...(extra ? { extra } : {}),
  });

  if (isDev) {
    console.error(`[${module}${action ? "/" + action : ""}]`, error);
  }
}

/**
 * Uyarı logla — Sentry'ye message olarak gönderir
 * Kritik olmayan ama takip edilmesi gereken durumlar için.
 */
export function logWarn(
  message: string,
  module: string,
  extra?: Record<string, unknown>
): void {
  Sentry.captureMessage(message, {
    level: "warning",
    tags: { module },
    ...(extra ? { extra } : {}),
  });

  if (isDev) {
    console.warn(`[${module}] ${message}`);
  }
}
