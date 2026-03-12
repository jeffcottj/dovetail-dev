import { NextResponse, type NextRequest } from 'next/server';
import {
  DEV_AUTH_COOKIE_NAME,
  createDevSessionToken,
  getDevUser,
  isDevAuthEnabled,
  type DevUserKey,
} from '../../../../lib/dev-auth';

export async function POST(request: NextRequest) {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const userKey = formData.get('user');

  if (typeof userKey !== 'string') {
    return NextResponse.json({ error: 'Missing user' }, { status: 400 });
  }

  const user = getDevUser(userKey);
  if (!user) {
    return NextResponse.json({ error: 'Unknown dev user' }, { status: 400 });
  }

  const token = await createDevSessionToken(userKey as DevUserKey);
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.set({
    name: DEV_AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
