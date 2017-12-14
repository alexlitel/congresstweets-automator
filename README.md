# Congressional Tweet Automator
[![Build Status](https://img.shields.io/travis/alexlitel/congresstweets-automator.svg?style=flat-square)](https://travis-ci.org/alexlitel/congresstweets-automator)
[![Coverage Status](https://img.shields.io/coveralls/alexlitel/congresstweets-automator.svg?style=flat-square)](https://coveralls.io/github/alexlitel/congresstweets-automator?branch=master)

This repo houses the backend portion of a project collecting the daily tweets of both houses of Congress (plus joint committees), encompassing 1,000+ campaign, office, committee and party accounts. It's designed to be used in concert with the [Tweets of Congress site](https://github.com/alexlitel/congresstweets), which features JSON datasets compiled daily by this app.

Licensed under [MIT](http://www.opensource.org/licenses/mit-license.php)

## How it works
This project is designed to run on a service like Heroku, interfacing with the Twitter API at a set interval to make sure tweets are captured. The app culls data from a Twitter list following all the relevant congressional accounts, the most anonymous way of following a Twitter account. If you follow this strategy (designed to minimizing chances of blocking), I recommend using an undetectable private Twitter list in combination with either a private Twitter account or a burner account you never use. To collect tweets, the app iterates through Twitter search queries.

To track tweets and a few other data points, the app uses a small Redis store that contains some stringified data that gets parsed when the app runs. To reduce unwieldiness, the app transforms the received Twitter tweet data into much smaller objects with a few properties like text, screen name, date, and id. Short and media URLs are unfurled in the text. The app also collects both retweets and full text of quoted tweets. At the end of the day (EST), the app empties out the previous day's tweet day into JSON dumps of tweets (generated using data from `data/users.json`, stored on the Redis store).

The app uses the Github API to commit JSON data (and a small MD file/Jekyll post for some frontend/RSS stuff) to the frontend repo. I have set up and recommend a secondary account so you do not have 30 extra commits at the end of the month on your page.

### Maintenance
In addition to the app collating tweets from a list, there is a highly customizable maintenance process that allows for the easy updating and organization of user datasets and the Twitter list and Redis store powering the project. The maintenance process checks the local user datasets against the Twitter list, and current legislator and social media datasets from [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) to look for outdated information, and if there is any outdated info, will update the datasets accordingly. Server-side or with a local Redis store, this process checks for reactivated and deactivated accounts, and deletes any accounts from the current user dataset that have been were deactivated long enough ago (more than 30 days) for Twitter to delete the account from its servers.

In addition to maintaining the datasets, the the process handles store and list initialization, and post-build updates of the store. Depending on the environment and configuration, the maintenance process can update files and/or store, and commit the updated datasets to Github with a message and body.

The maintenance process' behavior can be modified based on the options described below.

##### Options
There are a number of options that you can pass to the maintenance processes to customize its behavior. The options are passed as flags when running the `update` file (i.e. `node lib/update --exampleFlag=foo` or `babel-node src/update.js --exampleFlag=foo`, depending on environment).

* **`format-only`**: in local environment, simply sorts the dataset files tidily.

   *aliases: `format`, `ff`, `formatfiles`, `formatonly`, `fo`, `fmt`*
   
* **`has-bot`**: allows for saving the list-related changes from the self-updating maintenance process to the store, which can be used for a Twitter bot that sends out messages when an account is deactivated or renamed, or reactivated.

   *aliases: `hb`, `hasbot`, `bot`*
   
* **`init-list`**: in local environment, allows for the initialization of a Twitter list, and appends the list `id_str` as a `LIST_ID` in the `.env` file for later use. Optionally, you can set this option to a string value to customize the name of the list, otherwise it defaults to `congress`. 

   *aliases: `initlist`, `il`, `list`, `init`*
   
* **`local-store`**: in local environment, allows for running the maintenance process with a redis store.

   *aliases: `ls`, `localstore`, `nostore`*
   
* **`post-build`**: runs the maintenance process server-side to parse for post-build changes (whether to update store or list). `package.json` already includes `heroku-postbuild` script with this flag, so unless you are using another service, you probably do not needed to worry about this. 

   *aliases: `p`, `post`, `pb`, `postbuild`*
   
* **`self-update`**: runs the self-updating maintenance process, which will check for changes in the list, remote datasets and revise local data accordingly.

   *aliases: `s`, `self`, `su`, `selfupdate`*
   
* **`no-commit`**: allows for running the self-updating server-side maintenance process without triggering a commit. Revised datasets will be written to a file and the maintenance process is then called recursively with the post-build flag to update the store and list. 

   *aliases: `n`, `nc`, `no`, `nocommit`*
   
## Requisites
You'll need the following for this to work:
* Twitter API and secret keys
* Twitter consumer and secret keys
* Twitter list
* Github API key
* Two Github repos: one for frontend and another backend
* Node (currently 8x)
* Yarn
* Knowledge of Redis, APIs and the above things

## What is what
* `/data` - directory with datasets. You can quite easily use the data as a basis for wide range of things, and the account list is a custom list for which I poured a number of hours of work into painstakingly accumulating a variety of accounts. It's also updated via some automated maintenance. Entities listed sorted by chamber and entity type, and depending on entity type, state, name, and party.
  * `users` - contains all current committees, MOCs, caucuses, etc
  * `users-filtered` - contains all current congressional entities with active twitter accounts
  * `historical-users` - contains all committees, MOCs, caucuses, etc (both former and current) from the inception of the project, including a few exclusive data points including past screen names for accounts, whether an account was deleted, and previous properties for MOCs (i.e. party or chamber changes). I strongly recommend you use either this or the `historical-users-filtered` dataset if you to utilize the dataset for anything. If you do use the this dataset and associated accounts, make sure you use the `id` key rather than `screen_name`, which can very well change
  * `historical-users-filtered` - current and former congressional entites with twitter accounts
* `/src` - the directory with app source code
  * `app` - app class and methods for initialization and running
  * `maintenance` - store/list initialiation, server and local maintenance processes
  * `redis` - singleton for redis store
  * `config` - configuration file containing various app settings
  * `github` - methods and such for interacting with Github API
  * `twitter` - methods and such for interacting with Twitter API
  * `utils` - various utilities including time parsing, formatting, serialization, data, extraction et al
  * `helpers` - helper functions/classes, namely building the MD file/Jekyll post and creating a message for the maintenance process
  * `load-env` - singleton to load environmental variables
  * `main` - running the app class
  * `update` - running the maintenance class
* `/tests` - unit tests, which correspond to a number of files in the src, as well as mock data, utils and a mock API helper

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

##### Optional variables

* **`TZ`**: helps the `moment-timezone` module operate, but that defaults to `America/New_York` in its absence and isn't needed.
* **`SELF_REPO`**: For the self-updating maintenance process, allows for the quasi-recursive updates. 
* **`INIT_DATE`**: The initialization date for the app, must be in the format of `YYYY-MM-DD`. Otherwise, defaults to the current date. Used for store initialization and limiting number of current files in front-end repo.
 
Make sure you have Github repos set up for deployment, otherwise those parts of the app may fail. Deploying the app will automatically run unit tests and linters.

## Testing
To test the app, simply run `yarn test` to lint and run Jest tests and other fun stuff. As of V1, there's a mock API to handle the requests to Github content, Github's API and Twitter's API, and a variety of utilitie.

## Issues, etc.
If you come across any issues, don't hesitate to file any issue in this repo, make a pull request or [send an email](mailto:alexlitelATgmailDOTcom).

## Acknowledgements
* Dataset was created with the help of the [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) project.