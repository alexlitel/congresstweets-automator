import rp from 'request-promise'
import minBy from 'lodash/minBy'
import { getTime } from '../util'

export const getActualUrl = async (url) => {
  try {
    return (
      (
        await rp.head({
          simple: false,
          followRedirect: false,
          followOriginalHttpMethod: true,
          url,
          timeout: 3000
        })
      ).location || url
    )
  } catch (e) {
    return url
  }
}

export const getLink = (data) => {
  const {
    user: { screen_name: screenName },
    id_str: tweetId,
  } = data.retweeted_status?.id_str ? data.retweeted_status : data
  return `https://www.twitter.com/${screenName}/statuses/${tweetId}`
}

const matchUrl = async (url, data) => {
  const nonMediaUrl = (
    data.entities?.urls.find((item) => item.url === url) || {}
  ).expanded_url

  if (nonMediaUrl) {
    if (
      !nonMediaUrl.includes('facebook.com/') &&
      /\.\w{1,4}\/\w+$/.test(nonMediaUrl)
    ) {
      return getActualUrl(nonMediaUrl)
    }

    return nonMediaUrl
  }

  if (!data.extended_entities?.media) return url

  const mediaUrls = data.extended_entities.media.filter(
    (item) => item.url === url
  )
  if (!mediaUrls.length) return url

  return mediaUrls
    .map((item) => {
      if (item.type === 'photo') return item.media_url
      return `${item.media_url} ${
        minBy(item.video_info.variants, 'bitrate').url
      }`
    })
    .join(' ')
}

export const replaceUrls = async (data) => {
  let tweetString = data.full_text
  const matches = tweetString.match(/(\bhttps:\/\/t\.co\/\w+\b)/gi) || []

  for await (const match of matches) {
    const newUrl = await matchUrl(match, data)
    tweetString = tweetString.replace(match, newUrl)
  }

  return tweetString
}

export const getTweetAndQuoteText = async (data) => {
  let tweetText = await replaceUrls(data)
  const hasQuoteTweet = !!data.quoted_status?.user

  if (hasQuoteTweet) {
    tweetText += ` QT @${
      data.quoted_status.user.screen_name
    } ${await replaceUrls(data.quoted_status)}`
  }

  return tweetText
}

export const parseText = async (data) => {
  if (data.retweeted_status?.user) {
    return (
      `RT @${data.retweeted_status.user.screen_name} ` +
      `${await getTweetAndQuoteText(data.retweeted_status)}`
    )
  }

  return getTweetAndQuoteText(data)
}

export const normalizeTweetData = async (data) => {
  const parsedText = await parseText(data)
  const link = getLink(data)

  return {
    id: data.id_str,
    screen_name: data.user.screen_name,
    user_id: data.user.id_str,
    time: getTime(new Date(data.created_at), true),
    link,
    text: parsedText,
    source: data.source.split('"nofollow">')[1].slice(0, -4),
  }
}
