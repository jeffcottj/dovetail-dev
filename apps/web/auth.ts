import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import EntraId from 'next-auth/providers/microsoft-entra-id';
import Google from 'next-auth/providers/google';
import { db } from '@dovetail/db';

const provider = process.env.OAUTH_PROVIDER ?? 'google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers:
    provider === 'entra'
      ? [
          EntraId({
            clientId: process.env.ENTRA_CLIENT_ID!,
            clientSecret: process.env.ENTRA_CLIENT_SECRET!,
            tenantId: process.env.ENTRA_TENANT_ID!,
          }),
        ]
      : [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ],
  callbacks: {
    session({ session, user }) {
      // Attach role to session so the frontend and API can use it
      session.user.role = (user as { role?: string }).role ?? 'viewer';
      return session;
    },
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role ?? 'viewer';
      return token;
    },
  },
  session: { strategy: 'jwt' },
});
