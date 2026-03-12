import type { NextAuthConfig } from 'next-auth';
import EntraId from 'next-auth/providers/microsoft-entra-id';
import Google from 'next-auth/providers/google';

const provider = process.env.OAUTH_PROVIDER ?? 'google';

function buildEntraProvider() {
  const tenantId = process.env.ENTRA_TENANT_ID;
  if (!tenantId) throw new Error('ENTRA_TENANT_ID is not set');
  return EntraId({
    clientId: process.env.ENTRA_CLIENT_ID!,
    clientSecret: process.env.ENTRA_CLIENT_SECRET!,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email ?? profile.preferred_username,
        image: null,
      };
    },
  });
}

function buildProviders() {
  if (provider === 'entra') {
    if (
      process.env.ENTRA_CLIENT_ID &&
      process.env.ENTRA_CLIENT_SECRET &&
      process.env.ENTRA_TENANT_ID
    ) {
      return [buildEntraProvider()];
    }
    return [];
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    ];
  }

  return [];
}

// Edge-safe config — no DB imports. Used by middleware.
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: buildProviders(),
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  session: { strategy: 'jwt' },
};
