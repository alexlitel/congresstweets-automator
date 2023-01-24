import { Octokit } from '@octokit/rest'
import { GITHUB_TOKEN } from './config'
import { generateMeta, prettyPrint } from './util'

export const githubClient = new Octokit({
  auth: GITHUB_TOKEN,
  baseUrl: 'https://api.github.com',
  userAgent: 'TweetsOfCongressApp',
  request: {
    timeout: 5000,
  },
})

export const createBlobs = async (repo, owner, data, recursive) => {
  try {
    let promises

    if (recursive) {
      promises = await Object.entries(data.toWrite).map((pair) => [
        pair[0].replace(/_/g, '-'),
        prettyPrint(pair[1])
      ])
    } else {
      promises = [
        await JSON.stringify(data.tweets),
        await generateMeta(data.time.yesterdayDate),
      ]
    }

    return await Promise.all(
      promises.map(async (item, i) => {
        const buffer = await Buffer.from(recursive ? item[1] : item).toString(
          'base64'
        )
        const promiseData = (
          await githubClient.git.createBlob({
            repo,
            owner,
            content: buffer,
            encoding: 'base64',
          })
        ).data

        let blobPath
        if (recursive) {
          blobPath = `${item[0]}.json`
        } else {
          blobPath =
            i === 0
              ? `data/${data.time.yesterdayDate}.json`
              : `_posts/${data.time.yesterdayDate}--tweets.md`
        }

        return Object.assign(promiseData, {
          path: blobPath,
          type: 'blob',
          mode: '100644',
        })
      })
    )
  } catch (e) {
    return Promise.reject(e)
  }
}

export const getLatestCommitSha = async (repo, owner, opts = {}) => {
  try {
    return (
      await githubClient.repos.getCommit({
        repo,
        owner,
        ref: 'heads/master',
        ...opts,
        mediaType: {
          format: 'sha',
        },
      })
    ).data
  } catch (e) {
    return Promise.reject(e)
  }
}

export const getTree = async (repo, owner, sha, blobs) => {
  try {
    const treeSha = (
      await githubClient.git.getTree({
        repo,
        owner,
        tree_sha: sha,
        recursive: 1,
      })
    ).data.sha
    return { tree: blobs, base_tree: treeSha }
  } catch (e) {
    return Promise.reject(e)
  }
}

export const createTree = async (repo, owner, tree) => {
  try {
    return (
      await githubClient.git.createTree({
        repo,
        owner,
        ...tree,
      })
    ).data.sha
  } catch (e) {
    return Promise.reject(e)
  }
}

export const createCommit = async (
  repo,
  owner,
  treeSha,
  time,
  prevCommitSha,
  message
) => {
  try {
    const parents =
      typeof prevCommitSha === 'object' ? prevCommitSha : [prevCommitSha]
    return (
      await githubClient.git.createCommit({
        repo,
        owner,
        message: message || `Add tweets for ${time.yesterdayDate}`,
        tree: treeSha,
        parents,
      })
    ).data.sha
  } catch (e) {
    return Promise.reject(e)
  }
}

export const updateReference = async (repo, owner, sha) => {
  try {
    return githubClient.git.updateRef({
      repo,
      owner,
      ref: 'heads/master',
      sha,
      force: true,
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

export const updateRepo = async (data, options = {}) => {
  try {
    const { recursive, message, repo, owner } = options

    const headSha = await getLatestCommitSha(repo, owner)

    await createBlobs(repo, owner, data, recursive)
      .then((blobs) => getTree(repo, owner, headSha, blobs))
      .then((tree) => createTree(repo, owner, tree))
      .then((createdTree) =>
        createCommit(repo, owner, createdTree, data.time, headSha, message)
      )
      .then((commit) => updateReference(repo, owner, commit))

    return {
      success: true,
    }
  } catch (e) {
    return Promise.reject(e)
  }
}
