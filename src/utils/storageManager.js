/**
 * @fileoverview Capa resiliente de persistencia local (localStorage con fallback en memoria),
 * versionado de esquema, control de QuotaExceededError y utilidades de saneamiento HTML (XSS).
 */

const SCHEMA_VERSION = 4;
const VERSION_KEY = 'songquiz_schema_version';

/** Almacén volátil de respaldo cuando el navegador bloquea localStorage o se supera la cuota. */
const memoryFallback = new Map();

/**
 * Comprueba si `window.localStorage` está disponible y permite lectura/escritura.
 * @returns {boolean}
 */
function detectLocalStorage() {
  if (typeof window === 'undefined') return false;
  try {
    const probeKey = '__songquiz_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

const HAS_LOCAL_STORAGE = detectLocalStorage();

/**
 * @typedef {Object} StorageWriteResult
 * @property {boolean} ok - True si se persistió de forma duradera en localStorage.
 * @property {boolean} usedFallback - True si el dato se almacenó solo en memoria de sesión.
 * @property {'QUOTA_EXCEEDED'|'UNAVAILABLE'|'SERIALIZATION_ERROR'|null} errorCode
 */

/**
 * Lee un valor JSON desde localStorage (o respaldo en memoria) aplicando validación opcional.
 *
 * @template T
 * @param {string} key - Clave de almacenamiento.
 * @param {T} defaultValue - Valor devuelto si no existe, falla el parseo o no pasa el validador.
 * @param {(val: unknown) => boolean} [validator] - Función opcional para validar la estructura.
 * @returns {T}
 */
export function readStorageJSON(key, defaultValue, validator) {
  try {
    let raw = null;
    if (HAS_LOCAL_STORAGE) {
      raw = window.localStorage.getItem(key);
    }
    if (raw === null && memoryFallback.has(key)) {
      raw = memoryFallback.get(key);
    }
    if (raw === null || raw === undefined) {
      return defaultValue;
    }

    const parsed = JSON.parse(raw);
    if (typeof validator === 'function' && !validator(parsed)) {
      return defaultValue;
    }
    return parsed;
  } catch {
    return defaultValue;
  }
}

/**
 * Lee un valor primitivo en texto plano (útil para claves heredadas no serializadas como JSON).
 *
 * @param {string} key
 * @param {string} [defaultValue='']
 * @returns {string}
 */
export function readStorageRaw(key, defaultValue = '') {
  try {
    if (HAS_LOCAL_STORAGE) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
    if (memoryFallback.has(key)) {
      return String(memoryFallback.get(key));
    }
  } catch {
    // Silenciar fallos de acceso en modo privado estricto
  }
  return defaultValue;
}

/**
 * Serializa y escribe un valor JSON con gestión explícita de `QuotaExceededError`
 * y respaldo automático en memoria de sesión.
 *
 * @param {string} key - Clave de almacenamiento.
 * @param {unknown} value - Valor serializable a JSON.
 * @returns {StorageWriteResult}
 */
export function writeStorageJSON(key, value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, usedFallback: false, errorCode: 'SERIALIZATION_ERROR' };
  }

  memoryFallback.set(key, serialized);

  if (!HAS_LOCAL_STORAGE) {
    return { ok: false, usedFallback: true, errorCode: 'UNAVAILABLE' };
  }

  try {
    window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
    return { ok: true, usedFallback: false, errorCode: null };
  } catch (err) {
    const isQuota = Boolean(
      err && (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
      )
    );
    return {
      ok: false,
      usedFallback: true,
      errorCode: isQuota ? 'QUOTA_EXCEEDED' : 'UNAVAILABLE'
    };
  }
}

/**
 * Elimina una clave tanto de localStorage como del respaldo en memoria.
 *
 * @param {string} key
 */
export function removeStorageKey(key) {
  memoryFallback.delete(key);
  if (HAS_LOCAL_STORAGE) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorar si el navegador bloquea mutaciones
    }
  }
}

/**
 * Escapa caracteres HTML especiales para prevenir inyección XSS al renderizar
 * metadatos externos (títulos, artistas, géneros o JSON pegado por el usuario).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
