import fs from 'fs'
import path from 'path'
import MockApi from './helpers/api-mock'
import GithubHelper from '../src/github'
import { nativeClone } from '../src/util'

jest.setTimeout(60000)

const data = {}
let mockApi

const loadData = () => {
  data.users = JSON.parse(
    fs.readFileSync(path.join(__dirname, '/../data/users.json'))
  )
  data.time = {
    yesterdayDate: '2017-02-02',
  }
  data.tweets = JSON.parse(
    fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json'))
  )
}

beforeAll(() => {
  loadData()
  mockApi = new MockApi('github')
  mockApi.init()
})

afterAll(() => {
  jest.resetModules()
  MockApi.cleanMocks()
})

describe('Github helper methods', () => {
  let githubClient
  const mockFns = {}

  beforeAll(() => {
    githubClient = new GithubHelper('123', {
      owner: 'test',
      repo: 'foo',
    })
  })

  beforeEach(() => {
    jest.resetAllMocks()

    // eslint-disable-next-line
        for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }

    mockFns.createBlob = jest.spyOn(githubClient.client.git, 'createBlob')
    mockFns.createCommit = jest.spyOn(githubClient.client.git, 'createCommit')
    mockFns.createTree = jest.spyOn(githubClient.client.git, 'createTree')
    mockFns.updateRef = jest.spyOn(githubClient.client.git, 'updateRef')
    mockFns.getTree = jest.spyOn(githubClient.client.git, 'getTree')
    mockFns.getCommitRefSha = jest.spyOn(githubClient.client.repos, 'getCommit')
    mockApi.resetOptions()
  })

  describe('Constructor method', () => {
    test('Throws error if missing required properties', () => {
      expect(() => new GithubHelper()).toThrow(
        'Missing required props for Github client'
      )
      expect(() => new GithubHelper('foo', null)).toThrow(
        'Missing required props for Github client'
      )
      expect(
        () =>
          new GithubHelper('foo', {
            repo: 'whatever',
          })
      ).toThrow('Missing required props for Github client')
      expect(
        () =>
          new GithubHelper('foo', {
            owner: 'test',
          })
      ).toThrow('Missing required props for Github client')
    })
  })

  describe('Git methods', () => {
    describe('createBlobs', () => {
      test('Create blobs from data', async () => {
        const createdBlobs = await githubClient.createBlobs(data)

        expect(mockFns.createBlob).toHaveBeenCalledTimes(2)
        expect(mockFns.createBlob).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.any(String),
            ...githubClient.config,
          })
        )
        expect(createdBlobs).toHaveLength(2)
        expect(createdBlobs.every((blob) => !!blob.sha && !!blob.url)).toEqual(
          true
        )
        expect(createdBlobs[0].path).toEqual(
          `data/${data.time.yesterdayDate}.json`
        )
        expect(createdBlobs[1].path).toEqual(
          `_posts/${data.time.yesterdayDate}--tweets.md`
        )
      })

      test('Create blobs when self-updating class option set', async () => {
        const locData = JSON.parse(JSON.stringify(data))
        locData.toWrite = {}
        locData.toWrite.users = []
        locData.toWrite['users-filtered'] = []
        locData.toWrite['historical-users'] = []
        locData.toWrite['historical-users-filtered'] = []
        const createdBlobs = await githubClient.createBlobs(locData, true)

        expect(githubClient.client.git.createBlob).toHaveBeenCalledTimes(4)
        expect(createdBlobs).toHaveLength(4)
        expect(createdBlobs.every((blob) => !!blob.sha && !!blob.url)).toEqual(
          true
        )
        expect(createdBlobs[0].path).toEqual('data/users.json')
        expect(createdBlobs[1].path).toEqual('data/users-filtered.json')
        expect(createdBlobs[2].path).toEqual('data/historical-users.json')
        expect(createdBlobs[3].path).toEqual(
          'data/historical-users-filtered.json'
        )
      })
    })

    describe('getTree', () => {
      test('Retrieves tree', async () => {
        const blobs = ['data/DATE.json', '_posts/DATE--tweets.md'].map((x) => ({
          sha: 'foo',
          url: 'foo',
          path: x.replace('DATE', '2017-02-02'),
          type: 'blob',
          mode: '100644',
        }))
        const tree = await githubClient.getTree('foo', blobs)

        expect(tree).toEqual({
          base_tree: '049d7501dfc00219f4ab631f2c6635ea35d51dfe',
          tree: expect.arrayContaining(blobs),
        })
        expect(tree.tree).toHaveLength(2)
      })

      test('Retrieves tree with new files when self-updating class option set', async () => {
        mockApi.options = {
          recursive: true,
        }

        const blobs = [
          'users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered',
        ].map((x) => ({
          sha: 'foo',
          url: 'foo',
          path: `data/${x}.json`,
          type: 'blob',
          mode: '100644',
        }))

        const tree = await githubClient.getTree('foo', blobs)

        expect(tree).toEqual({
          tree: blobs,
          base_tree: expect.any(String),
        })
        expect(
          tree.tree.filter((item) =>
            item.path.includes('historical-users-filtered')
          )
        ).toHaveLength(1)
        expect(tree.tree).toHaveLength(4)
      })
    })

    describe('createTree', () => {
      test('Creates tree', async () => {
        const blobs = [
          'users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered',
        ].map((x) => ({
          sha: 'foo',
          url: 'foo',
          path: `data/${x}.json`,
          type: 'blob',
          mode: '100644',
        }))

        const createdTree = await githubClient.createTree({ tree: blobs })

        expect(mockFns.createTree).toHaveBeenCalledWith(
          expect.objectContaining({
            ...githubClient.config,
            tree: blobs,
          })
        )
        expect(createdTree).toEqual(expect.any(String))
      })

      test('Creates tree on top of base_tree', async () => {
        const blobs = [
          'users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered',
        ].map((x) => ({
          sha: 'foo',
          url: 'foo',
          path: `data/${x}.json`,
          type: 'blob',
          mode: '100644',
        }))

        const createdTree = await githubClient.createTree({
          tree: blobs,
          base_tree: 'foo',
        })

        expect(mockFns.createTree).toHaveBeenCalledWith(
          expect.objectContaining({
            ...githubClient.config,
            tree: blobs,
            base_tree: 'foo',
          })
        )
        expect(createdTree).toEqual(expect.any(String))
      })
    })

    describe('createCommit', () => {
      test('Creates commit', async () => {
        const commit = await githubClient.createCommit('foo', data.time, 'foo2')

        expect(mockFns.createCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            ...githubClient.config,
            message: `Add tweets for ${data.time.yesterdayDate}`,
            parents: ['foo2'],
          })
        )
        expect(commit).toEqual(expect.any(String))
      })

      test('Creates commit with multiple parents', async () => {
        const commit = await githubClient.createCommit('foo', data.time, [
          'foo2',
          'foo3',
        ])

        expect(mockFns.createCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            ...githubClient.config,
            message: `Add tweets for ${data.time.yesterdayDate}`,
            parents: ['foo2', 'foo3'],
          })
        )
        expect(commit).toEqual(expect.any(String))
      })

      test('Creates commit with custom message as argument', async () => {
        const commit = await githubClient.createCommit(
          'foo',
          data.time,
          'foo2',
          'Argument message'
        )

        expect(mockFns.createCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            ...githubClient.config,
            message: 'Argument message',
            parents: ['foo2'],
          })
        )
        expect(commit).toEqual(expect.any(String))
      })
    })

    describe('updateReference', () => {
      test('Updates reference', async () => {
        const updatedRef = await githubClient.updateReference('foo')

        expect(mockFns.updateRef).toHaveBeenCalledWith(
          expect.objectContaining({
            sha: 'foo',
            ref: 'heads/master',
          })
        )
        expect(updatedRef).toEqual(expect.any(Object))
      })
    })
  })

  describe('Repo methods', () => {
    describe('getLatestCommitSha', () => {
      test('Retrieves sha of last commit', async () => {
        const commitSha = await githubClient.getLatestCommitSha()

        expect(mockFns.getCommitRefSha).toHaveBeenCalledWith(
          expect.objectContaining({
            ref: 'heads/master',
            ...githubClient.config,
          })
        )
        expect(commitSha).toEqual(expect.any(String))
      })
    })
  })

  describe('Run process', () => {
    test('Regular run process', async () => {
      const runProcess = await githubClient.run(data)

      expect(mockFns.createBlob).toHaveBeenCalledTimes(2)
      expect(mockFns.createCommit).toHaveBeenCalled()
      expect(mockFns.createTree).toHaveBeenCalled()
      expect(mockFns.updateRef).toHaveBeenCalled()
      expect(mockFns.getTree).toHaveBeenCalled()
      expect(mockFns.getCommitRefSha).toHaveBeenCalled()
      expect(mockFns.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Add tweets for ${data.time.yesterdayDate}`,
        })
      )

      expect(runProcess).toEqual({
        success: true,
      })
    })

    test('Self-updating run process with custom message', async () => {
      const locData = nativeClone(data)
      locData.toWrite = {}
      locData.toWrite.users = []
      locData.toWrite['users-filtered'] = []
      locData.toWrite['historical-users'] = []
      locData.toWrite['historical-users-filtered'] = []
      const options = {}
      options.recursive = true
      options.message = 'Custom message'

      const runProcess = await githubClient.run(locData, options)

      expect(mockFns.createBlob).toHaveBeenCalledTimes(4)
      expect(mockFns.createCommit).toHaveBeenCalled()
      expect(mockFns.createTree).toHaveBeenCalled()
      expect(mockFns.updateRef).toHaveBeenCalled()
      expect(mockFns.getTree).toHaveBeenCalled()
      expect(mockFns.getCommitRefSha).toHaveBeenCalled()
      expect(mockFns.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom message',
        })
      )
      expect(runProcess).toEqual({
        success: true,
      })
    })
  })
})
