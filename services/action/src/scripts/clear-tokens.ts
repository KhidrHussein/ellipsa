import { oauthService } from '../email/services/OAuthService';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

async function clearTokens() {
  try {
    console.log('Clearing OAuth tokens...');
    
    // Clear in-memory tokens
    await oauthService.clearTokens();
    
    // Delete the token file if it exists
    const tokenPath = join(process.cwd(), 'gmail-token.json');
    if (existsSync(tokenPath)) {
      unlinkSync(tokenPath);
      console.log('Token file deleted successfully');
    } else {
      console.log('No token file found');
    }
    
    console.log('Successfully cleared tokens. Please restart the service to begin a new OAuth flow.');
  } catch (error) {
    console.error('Error clearing tokens:', error);
    process.exit(1);
  }
}

clearTokens();
