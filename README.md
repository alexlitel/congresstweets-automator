# Congressional Tweet Automator
[![Build Status](https://img.shields.io/travis/alexlitel/congresstweets-automator.svg?style=flat-square)](https://travis-ci.org/alexlitel/congresstweets-automator)
[![Coverage Status](https://img.shields.io/coveralls/alexlitel/congresstweets-automator.svg?style=flat-square)](https://coveralls.io/github/alexlitel/congresstweets-automator?branch=master)

This repo houses the backend portion of a project collecting the daily tweets of both houses of Congress (plus joint committees), encompassing 1,000+ campaign, office, committee and party accounts. It's designed to be used in concert with the [Tweets of Congress site](https://github.com/alexlitel/congresstweets), which features JSON datasets compiled daily by this app. The automator is alpha-ish and will probably change considerably.

Licensed under [MIT](http://www.opensource.org/licenses/mit-license.php)

## How it works
This project is designed to run on a service like Heroku, interfacing with the Twitter API at a set interval to make sure all tweets are captured. The app culls data from a Twitter list following all the relevant congressional accounts, the most anonymous way of following a Twitter account. If you follow this strategy (designed to minimizing chances of blocking), I recommend using an undetectable private Twitter list in combination with either a private Twitter account or a burner account you never use. This app does not presently initialize the list or automate following process, though I might create some version of the latter in the future.

To track tweets and a few other data points, the app uses a small Redis store that contains some stringified data that gets parsed when the app runs. To reduce unwieldiness, the app transforms the received Twitter tweet data into much smaller objects with a few properties like text, screen name, date, and id. It includes both retweets and full text of quoted tweets. At the end of the day (EST), the app empties out the previous day's tweet day into JSON dumps of tweets (generated using data from `data/users-filtered.json`, stored on the Redis store):
* chamber
* account type
  * committees: name, party
  * caucuses: party, name, campaign or office account
  * members: state, name (and party), campaign or office account
  * party: party, campaign or office account
* screen_name

The app uses the Github API to commit JSON data (and a small MD file/Jekyll post for some frontend/RSS stuff) to the frontend repo. I have set up and recommend a secondary account so you do not have 30 extra commits at the end of the month on your page. This app collects thousands of tweets daily, so to prevent the front-end repo with the data from getting too big, a future version will cull old material (including modifying the commit history to excise the old data) from the repo.

## Requisites
You'll need the following for this to work:
* Twitter API and secret keys
* Twitter consumer and secret keys
* Twitter list
* Github API key
* Two Github repos: one for frontend and another backend
	* Actually three, there's currently a private repo used for unit testing
* Node (currently 8x, though may have to downgrade)
* Yarn
* Knowledge of Redis, APIs and the above things

## What is what
* `/data` - directory with datasets, one of which (users.json) has all committees, MOCs, etc; the other (users-filtered.json) has a list of every major Congressional entity I've identified with Twitter accounts. You can quite easily use this as a basis for wide range of things, and the account list is a custom list for which I poured a number of hours of work into painstakingly accumulated a variety of accounts.
* `/src` - the directory with app source code
	* `app` - app class and methods for initialization and running
  * `redis` - singleton for redis store
  * `config` - configuration file containing various app settings
  * `github` - file containing the methods and such for interacting with Github API
  * `twitter` - file containing the methods and such for interacting with Twitter API
  * `utils` - various utilities including time parsing et al
  * `helpers` - helper functions/classes, namely building the MD file/Jekyll post
  * `load-env` - singleton to load environmental variables
  * `main` - running the app class
* `/tests` - unit tests, which correspond to a number of files in the src

## Installation

If you have Yarn installed, you can get started by forking the repo and/or cloning, and running `yarn init` and `yarn install` to install all the pertinent dependencies on your machine. (If not, install Yarn first.) You'll also need either a local or remote Redis instance to connect the Redis client.

## Running the app
You'll need the following environmental variables set in a `.env` file in the directory to get things up and running:
* TWITTER_API_KEY
* TWITTER_API_SECRET
* ACCESS_TOKEN
* ACCESS_TOKEN_SECRET
* LIST_ID
* GITHUB_TOKEN
* GITHUB_USER
* SITE_REPO

There's also a `TZ` variable for helping the `moment-timezone` module operate, but that defaults to `America/New_York` in its absence and isn't needed. Make sure you have Github repos set up for deployment, otherwise those parts of the app may fail. Deploying the app will automatically run unit tests and linters.

## Testing
To test the app, simply run `yarn test` to lint and run Jest tests and other fun stuff.

## Issues, etc.
If you come across any issues, don't hesitate to file any issue in this repo, make a pull request or [send an email](mailto:alexlitelATgmailDOTcom).

## Acknowledgements
* Dataset was created with the help of the [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) project.

#### Todo
- Automated maintenance process