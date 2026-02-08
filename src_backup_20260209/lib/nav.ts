// app/lib/nav.ts
// Çeto'nun önerisi: Path normalization ve safe navigation
'use client';

/**
 * Normalize path for static export with trailingSlash
 * /login → /login/
 * / → /
 */
export function normalizeExportPath(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  
  // Root özel
  if (path === '/') return '/';
  
  // Query/hash ayır
  const [base, rest] = path.split(/(?=[?#])/);
  
  // Static export + trailingSlash => /login/ formatı
  if (!base.endsWith('/') && !base.includes('.')) {
    return base + '/' + (rest ?? '');
  }
  
  return path;
}

/**
 * Safe navigation with path normalization
 * Capacitor'da /login yerine /login/ açar
 */
export function hardNavigate(path: string) {
  const target = normalizeExportPath(path);
  // replace: history şişmez, loop'ta geri tuşu kabus olmaz
  window.location.replace(target);
}
