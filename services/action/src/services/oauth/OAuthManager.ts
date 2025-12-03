import { IOAuthProvider } from './OAuthProvider.interface.js';
import { TokenService, TokenData } from './TokenService.js';

export class OAuthManager {
    private providers: Map<string, IOAuthProvider> = new Map();

    constructor(private tokenService: TokenService) { }

    registerProvider(provider: IOAuthProvider) {
        this.providers.set(provider.name, provider);
        console.log(`[OAuthManager] Registered provider: ${provider.name}`);
    }

    getProvider(name: string): IOAuthProvider | undefined {
        return this.providers.get(name);
    }

    getAuthUrl(providerName: string, userId: string): string {
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`Provider ${providerName} not found`);
        }
        // Encode userId in state to associate callback with user
        const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
        return provider.getAuthUrl(state);
    }

    async handleCallback(providerName: string, code: string, state: string): Promise<{ userId: string, token: TokenData }> {
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`Provider ${providerName} not found`);
        }

        // Decode state to get userId
        let userId: string;
        try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
            userId = stateData.userId;
        } catch (e) {
            throw new Error('Invalid state parameter');
        }

        // Exchange code for token
        const token = await provider.exchangeCode(code);

        // Store token
        await this.tokenService.setToken(userId, providerName, token);

        return { userId, token };
    }

    async getValidToken(userId: string, providerName: string): Promise<TokenData | null> {
        const token = await this.tokenService.getToken(userId, providerName);
        if (!token) return null;

        // Check if expired and refresh if needed
        if (token.expiresAt && Date.now() > token.expiresAt - 60000) { // Refresh 1 min before expiry
            const provider = this.providers.get(providerName);
            if (provider && provider.refreshToken && token.refreshToken) {
                try {
                    console.log(`[OAuthManager] Refreshing token for ${providerName}`);
                    const newToken = await provider.refreshToken(token);
                    await this.tokenService.setToken(userId, providerName, newToken);
                    return newToken;
                } catch (error) {
                    console.error(`[OAuthManager] Failed to refresh token for ${providerName}:`, error);
                    return null;
                }
            }
        }

        return token;
    }
}
