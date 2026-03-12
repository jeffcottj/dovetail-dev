import NextAuth, { type NextAuthResult } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authConfig } from './auth.config';

const nextAuth: NextAuthResult = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      if (!user.email) return false;
      if (!account) return false;
      const { db, users } = await import('@dovetail/db');

      const provider = account.provider === 'microsoft-entra-id' ? 'entra' : 'google';
      const providerId = account.providerAccountId ?? '';

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);

      if (!existing) {
        await db.insert(users).values({
          email: user.email,
          name: user.name ?? user.email,
          avatarUrl: user.image ?? null,
          role: 'viewer',
          provider,
          providerId,
        });
      }

      return true;
    },

    async jwt({ token, account }) {
      // account is only present on first sign-in
      if (account) {
        const { db, users } = await import('@dovetail/db');
        const [dbUser] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.email, token.email!))
          .limit(1);
        if (dbUser) {
          token.sub = dbUser.id;
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = (token.userId as string) ?? (token.sub as string) ?? '';
      session.user.role = (token.role as string) ?? 'viewer';
      return session;
    },
  },
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
