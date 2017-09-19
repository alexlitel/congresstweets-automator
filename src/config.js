export const TWITTER_CONFIG = {
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET,
}

export const TIME_ZONE = process.env.TZ || 'America/New_York'
export const LIST_ID = process.env.LIST_ID
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN
export const GITHUB_USER = process.env.GITHUB_USER
export const SITE_REPO = process.env.SITE_REPO
export const SELF_REPO = process.env.SELF_REPO

export const GITHUB_CONFIG = {
  owner: GITHUB_USER,
  repo: SITE_REPO,
}

export const APP_CONFIG = {
  SELF_REPO,
  TWITTER_CONFIG,
  GITHUB_CONFIG,
  LIST_ID,
  GITHUB_TOKEN,
}
