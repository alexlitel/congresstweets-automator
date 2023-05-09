import dotEnv from 'dotenv'

dotEnv.config()

export const IS_PROD = process.env.NODE_ENV === 'production'

/* eslint-disable */
export const TWITTER_CONFIG = {
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET,
  timeout_ms: 10000
}

export const TIME_ZONE = 'America/New_York'
export const LIST_ID = process.env.LIST_ID
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN
export const GITHUB_USER = process.env.GITHUB_USER
export const TWEET_REPO = process.env.TWEET_REPO
export const USER_REPO = process.env.USER_REPO
export const BUCKET = process.env.BUCKET || 'test'

export const GITHUB_CONFIG = {
  owner: GITHUB_USER,
  repo: TWEET_REPO,
}

export const APP_CONFIG = {
  IS_PROD,
  USER_REPO,
  TWITTER_CONFIG,
  GITHUB_CONFIG,
  LIST_ID,
  GITHUB_TOKEN,
}


/* eslint-enable */
