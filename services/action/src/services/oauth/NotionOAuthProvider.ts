import { IOAuthProvider } from './OAuthProvider.interface.js';
import { TokenData } from './TokenService.js';
import { Client } from '@notionhq/client';

export class NotionOAuthProvider implements IOAuthProvider {
    name = 'notion';
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            owner: 'user',
            redirect_uri: this.redirectUri,
            state: state
        });
        return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<TokenData> {
        // Notion requires Basic Auth with client_id:client_secret for token endpoint
        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const response = await fetch('https://api.notion.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Notion OAuth failed: ${error}`);
        }

        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: undefined, // Notion tokens don't expire
            scope: undefined,
            tokenType: data.token_type,
            workspaceId: data.workspace_id,
            botId: data.bot_id,
            owner: data.owner
        };
    }
}
