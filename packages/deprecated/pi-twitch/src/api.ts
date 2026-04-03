/**
 * Twitch Helix API Client
 * REST API for streams, users, chat, moderation, etc.
 */

import type { TwitchAuth } from './auth.js';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  created_at: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  tags: string[];
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  is_mature: boolean;
}

export interface TwitchClip {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
}

export interface TwitchChannel {
  id: string;
  name: string;
  description: string;
}

export interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
}

const API_BASE = 'https://api.twitch.tv/helix';

export class TwitchAPI {
  private auth: TwitchAuth;

  constructor(auth: TwitchAuth) {
    this.auth = auth;
  }

  /**
   * Generic GET request
   */
  private async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
    const url = new URL(`${API_BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      headers: this.auth.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Twitch API error: ${response.status}`);
    }

    const json = await response.json() as { data: T[] };
    return json.data;
  }

  /**
   * POST request for clip creation
   */
  private async post<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: this.auth.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Twitch API error: ${response.status}`);
    }

    const json = await response.json() as { data: T[] };
    return json.data[0];
  }

  // ============ Users ============

  async getUser(login?: string, id?: string): Promise<TwitchUser | null> {
    if (!login && !id) throw new Error('login or id required');
    const params: Record<string, string> = login ? { login } : { id: id! };
    const users = await this.get<TwitchUser>('/users', params);
    return users[0] || null;
  }

  async getUsers(logins?: string[]): Promise<TwitchUser[]> {
    if (!logins?.length) return [];
    const params: Record<string, string> = {};
    logins.forEach((l, i) => params[`login[${i}]`] = l);
    return this.get<TwitchUser>('/users', params);
  }

  // ============ Streams ============

  async getStream(broadcaster: string): Promise<TwitchStream | null> {
    const streams = await this.get<TwitchStream>('/streams', { user_login: broadcaster });
    return streams[0] || null;
  }

  // ============ Clips ============

  async createClip(broadcaster: string, hasDelay = false): Promise<TwitchClip> {
    const params: Record<string, string> = { broadcaster_id: broadcaster };
    if (hasDelay) params.has_delay = 'true';
    return this.post<TwitchClip>('/clips', params);
  }

  async getClips(broadcaster: string, limit = 20): Promise<TwitchClip[]> {
    return this.get<TwitchClip>('/clips', {
      broadcaster_id: broadcaster,
      first: String(Math.min(limit, 100)),
    });
  }

  // ============ Search ============

  async searchChannels(query: string, limit = 20): Promise<TwitchChannel[]> {
    return this.get<TwitchChannel>('/search/channels', {
      query,
      first: String(Math.min(limit, 100)),
    });
  }

  async searchCategories(query: string, limit = 20): Promise<TwitchGame[]> {
    return this.get<TwitchGame>('/search/categories', {
      query,
      first: String(Math.min(limit, 100)),
    });
  }

  // ============ Chat Settings ============

  async getChatSettings(broadcasterId: string): Promise<{
    broadcaster_id: string;
    moderator_id: string;
    slow: number;
    follower_delay: number;
    subscriber: boolean;
    emote_mode: boolean;
    unique_chat_mode: boolean;
  }> {
    const settings = await this.get<{
      broadcaster_id: string;
      moderator_id: string;
      slow: number;
      follower_delay: number;
      subscriber: boolean;
      emote_mode: boolean;
      unique_chat_mode: boolean;
    }>('/chat/settings', { broadcaster_id: broadcasterId });
    return settings[0] || {
      broadcaster_id: broadcasterId,
      moderator_id: '',
      slow: 0,
      follower_delay: -1,
      subscriber: false,
      emote_mode: false,
      unique_chat_mode: false,
    };
  }

  // ============ Moderation ============

  async getModerators(broadcasterId: string): Promise<TwitchUser[]> {
    return this.get<TwitchUser>('/moderation/moderators', { broadcaster_id: broadcasterId });
  }

  // ============ Games ============

  async getGame(gameId: string): Promise<TwitchGame | null> {
    const games = await this.get<TwitchGame>('/games', { id: gameId });
    return games[0] || null;
  }
}
