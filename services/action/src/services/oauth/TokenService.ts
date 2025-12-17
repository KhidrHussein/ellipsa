import fs from 'fs';
import path from 'path';

export interface TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number; // Timestamp in ms
    scope?: string;
    tokenType?: string;
    [key: string]: any;
}

/**
 * TokenService manages storage and retrieval of user access tokens.
 * Currently uses a local JSON file, but designed to be replaced with a DB.
 */
export class TokenService {
    private tokens: Map<string, Map<string, TokenData>> = new Map();
    private storageFile: string;

    constructor(storageDir: string = './data') {
        this.storageFile = path.join(storageDir, 'user_tokens.json');
        this.loadTokens();
    }

    /**
     * Set a token for a user and provider
     */
    async setToken(userId: string, provider: string, token: TokenData): Promise<void> {
        if (!this.tokens.has(userId)) {
            this.tokens.set(userId, new Map());
        }
        this.tokens.get(userId)!.set(provider, token);
        await this.saveTokens();
        console.log(`[TokenService] Saved token for user ${userId}, provider ${provider}`);
    }

    /**
     * Get a token for a user and provider
     */
    async getToken(userId: string, provider: string): Promise<TokenData | null> {
        const userTokens = this.tokens.get(userId);
        if (!userTokens) {
            console.log(`[TokenService] No tokens found for user ${userId}. Available users: ${Array.from(this.tokens.keys()).join(', ')}`);
            return null;
        }
        const token = userTokens.get(provider);
        if (!token) {
            console.log(`[TokenService] No token found for provider ${provider} for user ${userId}. Available providers: ${Array.from(userTokens.keys()).join(', ')}`);
        }
        return token || null;
    }

    /**
     * Delete a token
     */
    async deleteToken(userId: string, provider: string): Promise<void> {
        const userTokens = this.tokens.get(userId);
        if (userTokens) {
            userTokens.delete(provider);
            await this.saveTokens();
            console.log(`[TokenService] Deleted token for user ${userId}, provider ${provider}`);
        }
    }

    /**
     * Get all connected providers for a user
     */
    async getConnectedProviders(userId: string): Promise<string[]> {
        const userTokens = this.tokens.get(userId);
        if (!userTokens) return [];
        return Array.from(userTokens.keys());
    }

    /**
     * Find the first user that has a token for the given provider.
     * Useful for single-user local environments where we just want "the" active user.
     */
    async findUserWithProvider(provider: string): Promise<{ userId: string, token: TokenData } | null> {
        for (const [userId, providerMap] of this.tokens.entries()) {
            if (providerMap.has(provider)) {
                return { userId, token: providerMap.get(provider)! };
            }
        }
        return null;
    }

    private async saveTokens() {
        try {
            const dir = path.dirname(this.storageFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Convert Map to JSON-serializable object
            const data: Record<string, Record<string, TokenData>> = {};
            for (const [userId, providerMap] of this.tokens.entries()) {
                data[userId] = {};
                for (const [provider, token] of providerMap.entries()) {
                    data[userId][provider] = token;
                }
            }

            await fs.promises.writeFile(this.storageFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[TokenService] Failed to save tokens:', error);
        }
    }

    private loadTokens() {
        try {
            if (fs.existsSync(this.storageFile)) {
                const content = fs.readFileSync(this.storageFile, 'utf-8');
                const data = JSON.parse(content);

                for (const [userId, providerMap] of Object.entries(data)) {
                    const map = new Map<string, TokenData>();
                    for (const [provider, token] of Object.entries(providerMap as any)) {
                        map.set(provider, token as TokenData);
                    }
                    this.tokens.set(userId, map);
                }
                console.log(`[TokenService] Loaded tokens for ${this.tokens.size} users`);
            }
        } catch (error) {
            console.error('[TokenService] Failed to load tokens:', error);
        }
    }
}
