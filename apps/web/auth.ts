import NextAuth from 'next-auth';
import { eq } from 'drizzle-orm';
import { db, users } from '@dovetail/db';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      if (!user.email) return false;

      const provider = account?.provider === 'microsoft-entra-id' ? 'entra' : 'google';
      const providerId = account?.providerAccountId ?? '';

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
        const [dbUser] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.email, token.email!))
          .limit(1);
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },

    session({ session, token }) {
      session.user.role = (token.role as string) ?? 'viewer';
      return session;
    },
  },
});
