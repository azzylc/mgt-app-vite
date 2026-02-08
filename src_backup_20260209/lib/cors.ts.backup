// app/lib/cors.ts
import { NextRequest, NextResponse } from 'next/server';

type CorsOptions = {
  methods?: string[];
  allowHeaders?: string[];
  maxAgeSeconds?: number;
};

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

// x-admin-key kullanıyorsunuz → mutlaka allowHeaders'ta olmalı
const DEFAULT_ALLOW_HEADERS = [
  'content-type',
  'x-admin-key',
  'authorization',
  'sentry-trace',
  'baggage',
];

const DEFAULT_MAX_AGE = 60 * 10; // 10 dakika

function parseAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function getRequestOrigin(req: NextRequest): string | null {
  return req.headers.get('origin');
}

function isOriginAllowed(origin: string, allowed: Set<string>): boolean {
  return allowed.has(origin);
}

function buildCorsHeaders(origin: string, opts?: CorsOptions): Record<string, string> {
  const methods = (opts?.methods ?? DEFAULT_METHODS).join(', ');
  const allowHeaders = (opts?.allowHeaders ?? DEFAULT_ALLOW_HEADERS)
    .map(h => h.toLowerCase())
    .join(', ');

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': String(opts?.maxAgeSeconds ?? DEFAULT_MAX_AGE),
    'Vary': 'Origin',
  };
}

/**
 * Normal response'a CORS header ekler
 * Origin yoksa veya allowlist'te değilse dokunmaz
 */
export function withCors(req: NextRequest, res: NextResponse, opts?: CorsOptions): NextResponse {
  const origin = getRequestOrigin(req);
  if (!origin) return res;

  const allowed = parseAllowedOrigins();
  if (!isOriginAllowed(origin, allowed)) return res;

  const headers = buildCorsHeaders(origin, opts);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/**
 * Preflight (OPTIONS) handler
 * Allowed origin ise 204 No Content + CORS headers
 * Değilse 403 (debug kolay)
 */
export function corsPreflight(req: NextRequest, opts?: CorsOptions): NextResponse {
  const origin = getRequestOrigin(req);
  if (!origin) {
    return new NextResponse(null, { status: 204 });
  }

  const allowed = parseAllowedOrigins();
  if (!isOriginAllowed(origin, allowed)) {
    return NextResponse.json({ error: 'CORS origin not allowed', origin }, { status: 403 });
  }

  const res = new NextResponse(null, { status: 204 });
  const headers = buildCorsHeaders(origin, opts);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
