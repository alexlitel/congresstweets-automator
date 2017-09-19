import fs from 'fs'
import path from 'path'
import MockApi from './helpers/api-mock'
import GithubHelper from '../src/github'
import {
    testConfig,
} from './util/test-util'
import {
    nativeClone,
} from '../src/util'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

const data = {}
let mockApi

const loadData = () => {
  data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users.json')))
  data.time = {
    yesterdayDate: '2017-02-02',
  }
  data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json')))
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
    githubClient = new GithubHelper(testConfig.GITHUB_TOKEN, testConfig.GITHUB_CONFIG)
    githubClient.client.authenticate({
      type: 'oauth',
      token: githubClient.token,
    })
  })

  beforeEach(() => {
    jest.resetAllMocks()

    // eslint-disable-next-line
    for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }

    mockFns.createBlob = jest.spyOn(githubClient.client.gitdata, 'createBlob')
    mockFns.createCommit = jest.spyOn(githubClient.client.gitdata, 'createCommit')
    mockFns.createTree = jest.spyOn(githubClient.client.gitdata, 'createTree')
    mockFns.updateReference = jest.spyOn(githubClient.client.gitdata, 'updateReference')
    mockFns.getTree = jest.spyOn(githubClient.client.gitdata, 'getTree')
    mockFns.getShaOfCommitRef = jest.spyOn(githubClient.client.repos, 'getShaOfCommitRef')
    mockApi.resetOptions()
  })

  describe('Constructor method', () => {
    test('Throws error if missing required properties', () => {
      expect(() => new GithubHelper()).toThrow('Missing required props for Github client')
      expect(() => new GithubHelper('foo', null)).toThrow('Missing required props for Github client')
      expect(() => new GithubHelper('foo', {
        repo: 'whatever',
      })).toThrow('Missing required props for Github client')
      expect(() => new GithubHelper('foo', {
        owner: 'test',
      })).toThrow('Missing required props for Github client')
    })
  })

  describe('checkValidity', () => {
    test('Throws error if missing properties', () => {
      const missingAuth = {}
      const missingUserRepo = {
        token: 'foo',
      }
      const missingUser = {
        token: 'foo',
        config: {
          repo: 'foo',
        },
      }
      const missingRepo = {
        token: 'foo',
        config: {
          owner: 'foo',
        },
      }
      expect(() => githubClient.checkValidity.call(missingAuth)).toThrow('Missing Github auth token')
      expect(() => githubClient.checkValidity.call(missingUserRepo)).toThrow('Missing Github user and repo')
      expect(() => githubClient.checkValidity.call(missingUser)).toThrow('Missing Github user')
      expect(() => githubClient.checkValidity.call(missingRepo)).toThrow('Missing Github repo')
    })

    test('Valid if all properties are there', () => {
      expect(githubClient.checkValidity()).toEqual(true)
    })
  })

  describe('Gitdata methods', () => {
    describe('createBlobs', () => {
      test('Create blobs from data', async () => {
        const createdBlobs = await githubClient.createBlobs(data)

        expect(mockFns.createBlob).toHaveBeenCalledTimes(2)
        expect(mockFns.createBlob).toBeCalledWith(expect.objectContaining({
          content: expect.any(String),
          ...githubClient.config,
        }))
        expect(createdBlobs).toHaveLength(2)
        expect(createdBlobs.every(blob => !!blob.sha && !!blob.url)).toEqual(true)
        expect(createdBlobs[0].path).toEqual(`data/${data.time.yesterdayDate}.json`)
        expect(createdBlobs[1].path).toEqual(`_posts/${data.time.yesterdayDate}--tweets.md`)
      })

      test('Create blobs when self-updating class option set', async () => {
        const locData = JSON.parse(JSON.stringify(data))
        locData.toWrite = {}
        locData.toWrite.users = []
        locData.toWrite['users-filtered'] = []
        locData.toWrite['historical-users'] = []
        locData.toWrite['historical-users-filtered'] = []
        const createdBlobs = await githubClient.createBlobs(locData, true)

        expect(githubClient.client.gitdata.createBlob).toHaveBeenCalledTimes(4)
        expect(createdBlobs).toHaveLength(4)
        expect(createdBlobs.every(blob => !!blob.sha && !!blob.url)).toEqual(true)
        expect(createdBlobs[0].path).toEqual('data/users.json')
        expect(createdBlobs[1].path).toEqual('data/users-filtered.json')
        expect(createdBlobs[2].path).toEqual('data/historical-users.json')
        expect(createdBlobs[3].path).toEqual('data/historical-users-filtered.json')
      })
    })

    describe('getTree', () => {
      test('Retrieves tree', async () => {
        const blobs = ['data/DATE.json', '_posts/DATE--tweets.md']
                    .map(x => ({
                      sha: 'foo',
                      url: 'foo',
                      path: x.replace('DATE', '2017-02-02'),
                      type: 'blob',
                      mode: '100644',
                    }))
        const tree = await githubClient.getTree(data.time, 'foo', blobs)

        expect(tree).toEqual(expect.arrayContaining(blobs))
        expect(tree).toHaveLength(11)
      })

      test('Retrieves tree and omits files from X date when deleteDate set', async () => {
        const blobs = ['data/DATE.json', '_posts/DATE--tweets.md']
                    .map(x => ({
                      sha: 'foo',
                      url: 'foo',
                      path: x.replace('DATE', '2017-02-02'),
                      type: 'blob',
                      mode: '100644',
                    }))
        const locData = nativeClone(data)
        locData.time.deleteDate = '2017-06-01'
        const tree = await githubClient.getTree(locData.time, 'foo', blobs)

        expect(tree).toEqual(expect.arrayContaining(blobs))
        expect(tree).toEqual(expect.arrayContaining(blobs))
        expect(tree.map(item => item.path)).not.toContain('data/2017-06-01.json')
        expect(tree).toHaveLength(9)
      })

      test('Retrieves tree with overwritten files when self-updating class option set', async () => {
        mockApi.options = {
          recursive: true,
        }

        const blobs = ['users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered',
        ]
                    .map(x => ({
                      sha: 'foo',
                      url: 'foo',
                      path: `data/${x}.json`,
                      type: 'blob',
                      mode: '100644',
                    }))

        const tree = await githubClient.getTree(data.time, 'foo', blobs, true)

        expect(tree).toEqual(expect.arrayContaining(blobs))
        expect(tree.filter(item => item.path.includes('historical-users-filtered'))).toHaveLength(1)
        expect(tree).toHaveLength(13)
      })
    })

    describe('createTree', () => {
      test('Creates tree', async () => {
        const blobs = ['users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered',
        ]
                    .map(x => ({
                      sha: 'foo',
                      url: 'foo',
                      path: `data/${x}.json`,
                      type: 'blob',
                      mode: '100644',
                    }))

        const createdTree = await githubClient.createTree(blobs)

        expect(mockFns.createTree).toBeCalledWith(expect.objectContaining({
          ...githubClient.config,
          tree: blobs,
        }))
        expect(createdTree).toEqual(expect.any(String))
      })
    })


    describe('createCommit', () => {
      test('Creates commit', async () => {
        const commit = await githubClient.createCommit('foo', data.time, 'foo2')

        expect(mockFns.createCommit).toBeCalledWith(expect.objectContaining({
          ...githubClient.config,
          message: `Add tweets for ${data.time.yesterdayDate}`,
          parents: ['foo2'],
        }))
        expect(commit).toEqual(expect.any(String))
      })

      test('Creates commit with multiple parents', async () => {
        const commit = await githubClient.createCommit('foo', data.time, ['foo2', 'foo3'])

        expect(mockFns.createCommit).toBeCalledWith(expect.objectContaining({
          ...githubClient.config,
          message: `Add tweets for ${data.time.yesterdayDate}`,
          parents: ['foo2', 'foo3'],
        }))
        expect(commit).toEqual(expect.any(String))
      })

      test('Creates commit with custom message as argument', async () => {
        const commit = await githubClient.createCommit('foo', data.time, 'foo2', 'Argument message')

        expect(mockFns.createCommit).toBeCalledWith(expect.objectContaining({
          ...githubClient.config,
          message: 'Argument message',
          parents: ['foo2'],
        }))
        expect(commit).toEqual(expect.any(String))
      })
    })

    describe('updateReference', () => {
      test('Updates reference', async () => {
        const updatedRef = await githubClient.updateReference('foo')

        expect(mockFns.updateReference).toBeCalledWith(expect.objectContaining({
          sha: 'foo',
          ref: 'heads/master',
        }))
        expect(updatedRef).toEqual(expect.any(Object))
      })
    })
  })

  describe('Repo methods', () => {
    describe('getLatestCommitSha', () => {
      test('Retrieves sha of last commit', async () => {
        const commitSha = await githubClient.getLatestCommitSha()

        expect(mockFns.getShaOfCommitRef).toBeCalledWith(expect.objectContaining({
          ref: 'heads/master',
          ...githubClient.config,
        }))
        expect(commitSha).toEqual(expect.any(String))
      })
    })
  })


  describe('Run process', () => {
    test('Regular run process', async () => {
      const runProcess = await githubClient.run(data)

      expect(mockFns.createBlob).toHaveBeenCalledTimes(2)
      expect(mockFns.createCommit).toBeCalled()
      expect(mockFns.createTree).toBeCalled()
      expect(mockFns.updateReference).toBeCalled()
      expect(mockFns.getTree).toBeCalled()
      expect(mockFns.getShaOfCommitRef).toBeCalled()
      expect(mockFns.createCommit).toBeCalledWith(expect.objectContaining({
        message: `Add tweets for ${data.time.yesterdayDate}`,
      }))

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
      expect(mockFns.createCommit).toBeCalled()
      expect(mockFns.createTree).toBeCalled()
      expect(mockFns.updateReference).toBeCalled()
      expect(mockFns.getTree).toBeCalled()
      expect(mockFns.getShaOfCommitRef).toBeCalled()
      expect(mockFns.createCommit).toBeCalledWith(expect.objectContaining({
        message: 'Custom message',
      }))
      expect(runProcess).toEqual({
        success: true,
      })
    })
  })
})
