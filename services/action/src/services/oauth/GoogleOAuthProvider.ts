import { OAuth2Client } from 'google-auth-library';
import { IOAuthProvider } from './OAuthProvider.interface.js';
import { TokenData } from './TokenService.js';

export class GoogleOAuthProvider implements IOAuthProvider {
    readonly name = 'google';
    private client: OAuth2Client;

    constructor(
        private clientId: string,
        private clientSecret: string,
        private redirectUri: string
    ) {
        this.client = new OAuth2Client(
            clientId,
            clientSecret,
            redirectUri
        );
    }

    getAuthUrl(state: string): string {
        const scopes = [
            'https://mail.google.com/', // Full access to valid email content
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.labels',
            'https://www.googleapis.com/auth/calendar', // Full access to Calendar
            'email',
            'profile',
            'openid'
        ];

        return this.client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent', // Force consent to ensure refresh token
            include_granted_scopes: true,
            state: state
        });
    }

    async exchangeCode(code: string): Promise<TokenData> {
        try {
            const { tokens } = await this.client.getToken(code);

            // Validate we got what we needed
            if (!tokens.access_token) {
                throw new Error('No access token received from Google');
            }

            return {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || undefined,
                expiresAt: tokens.expiry_date || undefined,
                tokenType: tokens.token_type || undefined,
                scope: tokens.scope || undefined,
                idToken: tokens.id_token || undefined
            };
        } catch (error) {
            console.error('[GoogleOAuthProvider] Error exchanging code:', error);
            throw error;
        }
    }

    async refreshToken(token: TokenData): Promise<TokenData> {
        if (!token.refreshToken) {
            throw new Error('No refresh token available');
        }

        this.client.setCredentials({
            refresh_token: token.refreshToken
        });

        const { credentials } = await this.client.refreshAccessToken();

        return {
            accessToken: credentials.access_token!,
            refreshToken: credentials.refresh_token || token.refreshToken, // Keep old refresh token if not rotated
            expiresAt: credentials.expiry_date || undefined,
            tokenType: credentials.token_type || undefined,
            scope: credentials.scope || token.scope,
            idToken: credentials.id_token || token.idToken
        };
    }
}
