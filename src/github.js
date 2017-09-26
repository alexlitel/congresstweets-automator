import GithubApi from 'github'
import unionBy from 'lodash/unionBy'
import toPairs from 'lodash/toPairs'
import bluebird from 'bluebird'
import {
  BuildMd,
} from './helpers'

export default class GithubHelper {
  checkValidity() {
    if (!this.token) throw new Error('Missing Github auth token')
    else if (!this.config) throw new Error('Missing Github user and repo')
    else if (!this.config.owner) throw new Error('Missing Github user')
    else if (!this.config.repo) throw new Error('Missing Github repo')
    return true
  }

  async createBlobs(data, recursive) {
    try {
      await this.checkValidity()

      let promises

      if (recursive) {
        promises = await toPairs(data.toWrite).map(pair =>
          [pair[0].replace(/_/g, '-'), JSON.stringify(pair[1])])
      } else {
        promises = [await JSON.stringify(data.tweets),
          await BuildMd.generateMeta(data.time.yesterdayDate),
        ]
      }

      return bluebird.map(promises, async (item, i) => {
        const buffer = await Buffer.from(recursive ? item[1] : item).toString('base64')
        const promiseData = (await this
          .client
          .gitdata
          .createBlob({
            ...this.config,
            content: buffer,
            encoding: 'base64',
          })).data

        let blobPath
        if (recursive) {
          blobPath = `data/${item[0]}.json`
        } else {
          blobPath = i === 0
            ? `data/${data.time.yesterdayDate}.json`
            : `_posts/${data.time.yesterdayDate}--tweets.md`
        }

        return Object.assign(promiseData, {
          path: blobPath,
          type: 'blob',
          mode: '100644',
        })
      })
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async getLatestCommitSha(opts = {}) {
    try {
      await this.checkValidity()
      return (await this.client
        .repos
        .getShaOfCommitRef({
          ...this.config,
          ref: 'heads/master',
          ...opts,
        })).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async getTree(time, sha, blobs, recursive) {
    try {
      await this.checkValidity()
      const { tree } = (await this.client
        .gitdata
        .getTree({
          ...this.config,
          sha,
          recursive: true,
        })).data
      if (!recursive) {
        if (time.deleteDate) {
          return tree.filter(item => !item.path.includes(time.deleteDate)).concat(blobs)
        }
        return tree.concat(blobs)
      }
      return unionBy(blobs, tree, 'path')
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createTree(tree) {
    try {
      await this.checkValidity()
      return (await this.client
        .gitdata
        .createTree({
          ...this.config,
          tree,
        })).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createCommit(treeSha, time, prevCommitSha, message) {
    try {
      await this.checkValidity()

      const parents = typeof prevCommitSha === 'object' ? prevCommitSha : [prevCommitSha]
      return (await this.client
        .gitdata
        .createCommit({
          ...this.config,
          message: message || `Add tweets for ${time.yesterdayDate}`,
          tree: treeSha,
          parents,
        })).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async updateReference(sha) {
    try {
      await this.checkValidity()
      return this.client
        .gitdata
        .updateReference({
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

      await this.checkValidity()
      this.client.authenticate({
        type: 'oauth',
        token: this.token,
      })
      const headSha = await this.getLatestCommitSha()

      await this
        .createBlobs(data, recursive)
        .then(blobs => this.getTree(data.time, headSha, blobs, recursive))
        .then(tree => this.createTree(tree))
        .then(createdTree => this.createCommit(createdTree, data.time, headSha, message))
        .then(commit => this.updateReference(commit))

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

    this.client = new GithubApi({
      debug: false,
      protocol: 'https',
      host: 'api.github.com',
      headers: {
        'user-agent': 'TweetsOfCongressApp',
      },
      followRedirects: false,
      timeout: 5000,
      promise: bluebird,
    })

    this.token = token
    this.config = config
  }
}
