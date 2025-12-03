import { IOAuthProvider } from './OAuthProvider.interface.js';
import { TokenData } from './TokenService.js';

export class GitHubOAuthProvider implements IOAuthProvider {
    name = 'github';
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private scopes: string[] = ['repo', 'user', 'project'];

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: this.scopes.join(' '),
            state: state,
            allow_signup: 'true'
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<TokenData> {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: this.redirectUri
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitHub OAuth failed: ${error}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
            scope: data.scope,
            tokenType: data.token_type
        };
    }

    async refreshToken(token: TokenData): Promise<TokenData> {
        if (!token.refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken
            })
        });

        if (!response.ok) {
            throw new Error('GitHub token refresh failed');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`GitHub refresh error: ${data.error_description || data.error}`);
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
            scope: data.scope,
            tokenType: data.token_type
        };
    }
}
