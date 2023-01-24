export const buildQueries = (data) => {
  let queries
  if (typeof data === 'object') {
    queries = data
      .map((x, i, a) =>
        encodeURIComponent(
          `from:${x.screen_name}${i < a.length - 1 ? ' OR ' : ''}`
        )
      )
      .reduce((p, c) => {
        const len = p.length
        const last = len ? p[len - 1] : null
        const lastLen = last ? last.length : null
        if (len) {
          if (lastLen + c.length < 446) {
            p[len - 1] = [last, c].join('')
          } else if (lastLen + c.length < 454 && c.endsWith('%20OR%20')) {
            p[len - 1] = [last, c.slice(0, -8)].join('')
          } else {
            if (last.endsWith('%20OR%20')) p[len - 1] = last.slice(0, -8)
            p.push(c)
          }
        } else {
          p.push(c)
        }
        return p
      }, [])
  } else {
    queries = [encodeURIComponent(`list:${data}`)]
  }
  return queries.map((query) =>
    [
      query,
      encodeURIComponent(' include:nativeretweets AND include:retweets'),
    ].join('')
  )
}
