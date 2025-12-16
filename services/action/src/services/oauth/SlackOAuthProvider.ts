import { IOAuthProvider } from './OAuthProvider.interface.js';
import { TokenData } from './TokenService.js';
import { WebClient } from '@slack/web-api';

export class SlackOAuthProvider implements IOAuthProvider {
    name = 'slack';
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private scopes: string[] = ['chat:write', 'im:write', 'channels:read', 'groups:read', 'mpim:read', 'users:read'];

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            scope: this.scopes.join(','),
            redirect_uri: this.redirectUri,
            state: state,
            user_scope: '' // We use bot scopes usually, but for user acting as user we might need user_scope if using user tokens. 
            // However, Slack v2 apps use granular bot permissions that can impersonate if configured, 
            // OR we use user tokens. For "act as user", we ideally want user tokens.
            // Let's stick to standard scopes for now which yield a bot token that can post.
            // If we want to act AS the user, we need 'user_scope'.
        });
        // For true "act as user", we should use user_scope.
        // Updated to include read permissions so the app can see what the user sees
        params.append('user_scope', 'chat:write,files:write,channels:read,groups:read,im:read,mpim:read,users:read');

        return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<TokenData> {
        const client = new WebClient();
        const response = await client.oauth.v2.access({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code: code,
            redirect_uri: this.redirectUri
        });

        if (!response.ok) {
            throw new Error(`Slack OAuth failed: ${response.error}`);
        }

        // We prefer the user token if available to act AS the user
        const accessToken = response.authed_user?.access_token || response.access_token;

        if (!accessToken) {
            throw new Error('No access token returned from Slack');
        }

        return {
            accessToken: accessToken,
            refreshToken: undefined, // Slack tokens don't expire by default unless rotation enabled
            scope: response.scope,
            tokenType: 'Bearer',
            botUserId: response.bot_user_id,
            userId: response.authed_user?.id,
            teamId: response.team?.id
        };
    }

    // Slack tokens don't typically expire unless configured for rotation
    // Implementing refresh is optional but good if rotation is enabled
}
