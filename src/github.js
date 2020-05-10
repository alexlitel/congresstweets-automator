import { Octokit } from '@octokit/rest'
import { BuildMd } from './helpers'

export default class GithubHelper {
  async createBlobs(data, recursive) {
    try {
      let promises

      if (recursive) {
        promises = await Object.entries(data.toWrite).map((pair) => [
          pair[0].replace(/_/g, '-'),
          JSON.stringify(pair[1]),
        ])
      } else {
        promises = [
          await JSON.stringify(data.tweets),
          await BuildMd.generateMeta(data.time.yesterdayDate),
        ]
      }

      return await Promise.all(
        promises.map(async (item, i) => {
          const buffer = await Buffer.from(recursive ? item[1] : item).toString(
            'base64'
          )
          const promiseData = (
            await this.client.git.createBlob({
              ...this.config,
              content: buffer,
              encoding: 'base64',
            })
          ).data

          let blobPath
          if (recursive) {
            blobPath = `data/${item[0]}.json`
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

  async getLatestCommitSha(opts = {}) {
    try {
      return (
        await this.client.repos.getCommit({
          ...this.config,
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

  async getTree(sha, blobs) {
    try {
      const treeSha = (
        await this.client.git.getTree({
          ...this.config,
          tree_sha: sha,
          recursive: 1,
        })
      ).data.sha
      return { tree: blobs, base_tree: treeSha }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createTree(tree) {
    try {
      return (
        await this.client.git.createTree({
          ...this.config,
          ...tree,
        })
      ).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createCommit(treeSha, time, prevCommitSha, message) {
    try {
      const parents =
        typeof prevCommitSha === 'object' ? prevCommitSha : [prevCommitSha]
      return (
        await this.client.git.createCommit({
          ...this.config,
          message: message || `Add tweets for ${time.yesterdayDate}`,
          tree: treeSha,
          parents,
        })
      ).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async updateReference(sha) {
    try {
      return this.client.git.updateRef({
        ...this.config,
        ref: 'heads/master',
        sha,
        force: true,
      })
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async run(data, options = {}) {
    try {
      const { recursive, message } = options

      const headSha = await this.getLatestCommitSha()

      await this.createBlobs(data, recursive)
        .then((blobs) => this.getTree(headSha, blobs))
        .then((tree) => this.createTree(tree))
        .then((createdTree) =>
          this.createCommit(createdTree, data.time, headSha, message)
        )
        .then((commit) => this.updateReference(commit))

      return {
        success: true,
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  constructor(token, config) {
    if (!token || !config || !config.owner || !config.repo) {
      throw new Error('Missing required props for Github client')
    }

    this.token = token

    this.client = new Octokit({
      auth: this.token,
      baseUrl: 'https://api.github.com',
      userAgent: 'TweetsOfCongressApp',
      request: {
        timeout: 5000,
      },
    })
    this.config = config
  }
}
