import fs from 'fs'
import path from 'path'
import '../src/load-env'
import GithubHelper from '../src/github'
import {
    getTime,
} from '../src/util'
import {
    GITHUB_TOKEN,
    GITHUB_CONFIG,
} from '../src/config'


jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

describe('Github helper methods', () => {
  const githubClient = new GithubHelper(GITHUB_TOKEN, GITHUB_CONFIG)
  const data = {}
  
  beforeAll(() => {
    githubClient.client.authenticate({
      type: 'oauth',
      token: githubClient.token,
    })
    data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json')))
    data.time = {
      yesterdayDate: getTime('2017-06-01', 'YYYY-MM-DD'),
    }
  })

  test('Get last commit sha', async () => {
    await expect(githubClient.getLatestCommitSha()).resolves.toEqual(expect.any(String))
  })

  test('Create blobs', async () => {
    const blobs = [{
      sha: expect.any(String),
      url: expect.any(String),
      path: `data/${data.time.yesterdayDate}.json`,
      type: 'blob',
      mode: '100644',
    }, {
      sha: expect.any(String),
      url: expect.any(String),
      path: `_posts/${data.time.yesterdayDate}--tweets.md`,
      type: 'blob',
      mode: '100644',
    }]
    await expect(githubClient.createBlobs(data)).resolves.toEqual(blobs)
  })

  test('Get tree', async () => {
    const treeObj = [{
      mode: '100644',
      path: 'README.md',
      sha: expect.any(String),
      size: expect.any(Number),
      type: 'blob',
      url: expect.any(String),
    }]
    const blobs = await githubClient.createBlobs(data)
    const sha = await githubClient.getLatestCommitSha()
    await expect(githubClient.getTree(data.time, sha, blobs))
          .resolves.toEqual(expect.arrayContaining(treeObj))
  })


  test('Create tree', async () => {
    const sha = await githubClient.getLatestCommitSha()
    const tree = await githubClient.getTree(data.time, sha, [])
    await expect(githubClient.createTree(tree)).resolves.toEqual(expect.any(String))
  })

  test('Create commit', async () => {
    const sha = await githubClient.getLatestCommitSha()
    const tree = await githubClient.getTree(data.time, sha, [])
    const newTree = await githubClient.createTree(tree)
    await expect(githubClient.createCommit(newTree, data.time, sha, 'Added records for test')).resolves.toEqual(expect.any(String))
  })

  test('Update reference', async () => {
    const sha = await githubClient.getLatestCommitSha()
    const tree = await githubClient.getTree(data.time, sha, [])
    const newTree = await githubClient.createTree(tree)
    const commit = await githubClient.createCommit(newTree, data.time, sha, 'Added records for test')
    expect(await githubClient.updateReference(commit)).toEqual(expect.any(Object))
  })

  test('Run process', async () => {
    	await expect(githubClient.run(data)).resolves.toEqual({ success: true })
  })
})
