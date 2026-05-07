import NextAuth, { type NextAuthResult } from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';
import type { NextMiddlewareResult } from 'next/dist/server/web/types';
import { sanitizeCallbackUrl } from './lib/callback-url';

const nextAuth: NextAuthResult = NextAuth(authConfig);

const middleware: ReturnType<NextAuthResult['auth']> = nextAuth.auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLogin = req.nextUrl.pathname === '/login';

  if (!isLoggedIn && !isOnLogin) {
    const loginUrl = new URL('/login', req.url);
    const requestedPath = req.nextUrl.pathname + req.nextUrl.search;
    const callback = sanitizeCallbackUrl(requestedPath);
    if (callback) {
      loginUrl.searchParams.set('callbackUrl', callback);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isOnLogin) {
    const callback = sanitizeCallbackUrl(req.nextUrl.searchParams.get('callbackUrl'));
    return NextResponse.redirect(new URL(callback ?? '/', req.url));
  }

  return undefined as unknown as NextMiddlewareResult;
});

export default middleware;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos/).*)'],
};
