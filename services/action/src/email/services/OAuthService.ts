import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';

// Load environment variables first
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  console.log('Loading environment from:', envPath);
  config({ path: envPath });
} else {
  console.error('No .env file found at:', envPath);
}

// Handle both Electron and Node.js environments
const isElectron = typeof window !== 'undefined' && window.require;

// Get user data directory
const tokenPath = (() => {
  if (isElectron && window.require) {
    try {
      const { app } = window.require('electron');
      return join(app.getPath('userData'), 'gmail-token.json');
    } catch (error) {
      console.error('Error getting Electron app path:', error);
    }
  }
  // For Node.js environment, use the project root
  return join(process.cwd(), 'gmail-token.json');
})();

console.log('Token will be saved to:', tokenPath);

export class OAuthService {
  private static instance: OAuthService;
  private oauth2Client: OAuth2Client;

  private constructor() {
    // Verify required environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4004/oauth2callback';

    console.log('Environment variables:', {
      clientId: clientId ? 'Found' : 'Missing',
      clientSecret: clientSecret ? 'Found' : 'Missing',
      redirectUri: redirectUri
    });

    if (!clientId || !clientSecret) {
      throw new Error('Missing required Google OAuth credentials in environment variables');
    }

    this.oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri
    });

    // Load previously stored tokens or use the refresh token from .env
    const tokens = this.loadTokens();
    if (!tokens && process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        // Add other required fields if needed
        access_token: '',
        expiry_date: 0,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
        id_token: ''
      });
    } else if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }
  }

  static getInstance(): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService();
    }
    return OAuthService.instance;
  }

  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  async getAuthUrl(): Promise<string> {
    // Full Gmail API access scope
    const scopes = [
      'https://mail.google.com/', // Full access to the account, including email content and settings
      'https://www.googleapis.com/auth/gmail.modify', // Modify threads and labels
      'https://www.googleapis.com/auth/gmail.compose', // Compose and send emails
      'https://www.googleapis.com/auth/gmail.labels' // Manage labels
    ];

    if (!this.oauth2Client._clientId) {
      throw new Error('OAuth client ID is not set. Please check your .env file and ensure GOOGLE_CLIENT_ID is set.');
    }

    // Set the correct access type and prompt for consent
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force the consent screen to ensure we get a refresh token
      include_granted_scopes: true
    });

    console.log('Generated auth URL:', authUrl);
    return authUrl;
  }

  async getTokensFromCode(code: string): Promise<any> {
    console.log('Exchanging authorization code for tokens...');
    try {
      const { tokens } = await this.oauth2Client.getToken(code as string);
      console.log('Successfully obtained tokens:', {
        access_token: tokens.access_token ? '***' : 'missing',
        refresh_token: tokens.refresh_token ? '***' : 'missing',
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'missing'
      });
      
      this.oauth2Client.setCredentials(tokens);
      await this.saveTokens(tokens);
      return tokens;
    } catch (error: any) {
      console.error('Error exchanging code for tokens:', error);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
      } else if (error.message) {
        console.error('Error message:', error.message);
      }
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const tokens = this.loadTokens();
    if (!tokens) return false;

    try {
      this.oauth2Client.setCredentials(tokens);
      const tokenInfo = await this.oauth2Client.getTokenInfo(
        this.oauth2Client.credentials.access_token || ''
      );
      return !!tokenInfo;
    } catch (error) {
      console.error('Error verifying token:', error);
      return false;
    }
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = this.loadTokens();
    if (!tokens) return null;

    // Check if token is expired
    if (tokens.expiry_date && Date.now() >= tokens.expiry_date - 60000) {
      const newTokens = await this.refreshTokens(tokens.refresh_token);
      if (newTokens) {
        this.saveTokens(newTokens);
        return newTokens.access_token;
      }
      return null;
    }

    return tokens.access_token || null;
  }

  async clearTokens(): Promise<void> {
    this.oauth2Client.setCredentials({});
    try {
      if (existsSync(tokenPath)) {
        writeFileSync(tokenPath, '');
      }
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  }

  private async refreshTokens(refreshToken: string): Promise<any> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      this.saveTokens(credentials);
      return credentials;
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return null;
    }
  }

  saveTokens(tokens: any): void {
    try {
      writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.error('Error saving tokens:', error);
      throw error;
    }
  }

  private loadTokens() {
    if (existsSync(tokenPath)) {
      try {
        const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
        console.log('Loaded tokens from file');
        this.oauth2Client.setCredentials(tokens);
        return tokens;
      } catch (error) {
        console.error('Error loading tokens:', error);
      }
    } else {
      console.log('No token file found at', tokenPath);
    }
    return null;
  }
}

export const oauthService = OAuthService.getInstance();
