/**
 * Twitch OAuth Authentication
 * Handles App Access Tokens
 */

export interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  channels?: string[];
  autoConnect?: boolean;
  events?: string[];
}

export interface TwitchToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

export class TwitchAuth {
  private config: TwitchConfig;
  private token: TwitchToken | null = null;
  private tokenExpiry: number = 0;

  constructor(config: TwitchConfig) {
    this.config = config;
  }

  /**
   * Get a valid access token (refreshing if needed)
   */
  async getAccessToken(): Promise<string> {
    // Check if current token is still valid (with 60s buffer)
    if (this.token && Date.now() < this.tokenExpiry - 60000) {
      return this.token.access_token;
    }

    // Refresh the token
    await this.refreshToken();
    return this.token!.access_token;
  }

  /**
   * Refresh the App Access Token
   */
  async refreshToken(): Promise<void> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json() as TwitchToken;
    this.token = data;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }

  /**
   * Get authorization headers for API requests
   */
  getHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('Not authenticated - call getAccessToken() first');
    }

    return {
      'Client-ID': this.config.clientId,
      'Authorization': `Bearer ${this.token.access_token}`,
    };
  }

  /**
   * Check if token is valid
   */
  isAuthenticated(): boolean {
    return this.token !== null && Date.now() < this.tokenExpiry;
  }
}
