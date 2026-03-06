import NextAuth, { type NextAuthResult } from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';
import type { NextMiddlewareResult } from 'next/dist/server/web/types';

const nextAuth: NextAuthResult = NextAuth(authConfig);

const middleware: ReturnType<NextAuthResult['auth']> = nextAuth.auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return undefined as unknown as NextMiddlewareResult;
});

export default middleware;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
