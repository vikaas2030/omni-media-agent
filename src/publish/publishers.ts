import { uploadToYouTube } from './youtube.js';
import { uploadToInstagram } from './instagram.js';
import { uploadToFacebook } from './facebook.js';

const env = (k: string) => (process.env[k] ?? '').trim();

export interface PublishPayload {
  filePath: string;
  thumbnailPath?: string;
  title: string;
  description: string;
  tags?: string[];
}

export interface Publisher {
  platform: string;
  configured(): boolean;
  upload(payload: PublishPayload): Promise<string>;
}

/**
 * Each publisher uses the platform's OFFICIAL API with your own tokens.
 * Platform quotas/limits are theirs — our software never meters anything.
 */
class YouTubePublisher implements Publisher {
  platform = 'youtube';
  configured() {
    return (
      !!env('YOUTUBE_ACCESS_TOKEN') ||
      (!!env('YOUTUBE_REFRESH_TOKEN') && !!env('YOUTUBE_CLIENT_ID') && !!env('YOUTUBE_CLIENT_SECRET'))
    );
  }
  async upload(p: PublishPayload) {
    return uploadToYouTube(p);
  }
}

class InstagramPublisher implements Publisher {
  platform = 'instagram';
  configured() {
    return !!env('INSTAGRAM_USER_ID') && !!env('INSTAGRAM_ACCESS_TOKEN');
  }
  async upload(p: PublishPayload) {
    return uploadToInstagram(p);
  }
}

class FacebookPublisher implements Publisher {
  platform = 'facebook';
  configured() {
    return !!env('FACEBOOK_PAGE_ID') && !!env('FACEBOOK_ACCESS_TOKEN');
  }
  async upload(p: PublishPayload) {
    return uploadToFacebook(p);
  }
}

export function getPublisher(platform: string): Publisher {
  const map: Record<string, Publisher> = {
    youtube: new YouTubePublisher(),
    instagram: new InstagramPublisher(),
    facebook: new FacebookPublisher(),
  };
  const pub = map[platform];
  if (!pub) throw new Error(`Unknown platform: ${platform}`);
  return pub;
}
