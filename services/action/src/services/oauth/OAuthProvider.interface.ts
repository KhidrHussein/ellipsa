import { TokenData } from './TokenService.js';

export interface IOAuthProvider {
    name: string;

    /**
     * Get the authorization URL to redirect the user to
     */
    getAuthUrl(state: string): string;

    /**
     * Exchange authorization code for access token
     */
    exchangeCode(code: string): Promise<TokenData>;

    /**
     * Refresh access token if supported
     */
    refreshToken?(token: TokenData): Promise<TokenData>;

    /**
     * Get user profile information (optional)
     */
    getUserProfile?(token: TokenData): Promise<{
        id: string;
        name?: string;
        email?: string;
        avatarUrl?: string;
    }>;
}
