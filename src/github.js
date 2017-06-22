import GithubApi from 'github'
import bluebird from 'bluebird'
import {
  BuildMd,
} from './helpers'

export default class GithubHelper {

  async createBlobs(data) {
    const promises = [await JSON.stringify(data.tweets),
      await BuildMd.transformData(data.time.yesterdayDate, data.tweets, data.users),
    ]

    try {
      return bluebird.map(promises, async (item, i) => {
        const buffer = await new Buffer(item).toString('base64')
        const promiseData = (await this
          .client
          .gitdata
          .createBlob({
            ...this.config,
            content: buffer,
            encoding: 'base64',
          })).data

        return Object.assign(promiseData, {
          path: i === 0 ?
            `data/${data.time.yesterdayDate}.json` :
            `_posts/${data.time.yesterdayDate}--tweets.md`,
          type: 'blob',
          mode: '100644',
        })
      })
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async getLatestCommitSha() {
    try {
      return (await this.client
        .repos
        .getShaOfCommitRef({
          ...this.config,
          ref: 'heads/gh-pages',
        })).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async getTree(time, sha, blobs) {
    try {
      const tree = (await this.client
        .gitdata
        .getTree({
          ...this.config,
          sha,
          recursive: true,
        })).data.tree

      if (time.deleteDate) {
        return [...tree.filter(item => !item.path.includes(time.deleteDate)), ...blobs]
      }
      return [...tree, ...blobs]
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createTree(tree) {
    try {
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

  async createCommit(tree, time, prevCommitSha, message = undefined) {
    try {
      return (await this.client
        .gitdata
        .createCommit({
          ...this.config,
          message: message || `Added records for ${time.yesterdayDate}`,
          tree,
          parents: [prevCommitSha],
        })).data.sha
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async updateReference(sha) {
    try {
      return this.client
        .gitdata
        .updateReference({
          ...this.config,
          ref: 'heads/gh-pages',
          sha,
          force: true,
        })
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async run(data) {
    try {
      this.client.authenticate({
        type: 'oauth',
        token: this.token,
      })
      const headSha = await this.getLatestCommitSha()
      
      await this
        .createBlobs(data)
        .then(blobs => this.getTree(data.time, headSha, blobs))
        .then(tree => this.createTree(tree))
        .then(createdTree => this.createCommit(createdTree, data.time, headSha))
        .then(commit => this.updateReference(commit))
        
      return {
        success: true,
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  constructor(token, config) {
    this.client = new GithubApi({
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
