# Congressional Tweet Automator)

This repo houses the backend portion of a project collecting the daily tweets of both houses of Congress (plus joint committees), encompassing 1,000+ campaign, office, committee and party accounts. It's designed to be used in concert with the [Congressional Twitter Accounts datasets](https://github.com/alexlitel/congresstweets-accounts) and [Tweets of Congress site](https://github.com/alexlitel/congresstweets), which features JSON datasets compiled daily by this app and user datasets use.

Licensed under [MIT](http://www.opensource.org/licenses/mit-license.php)

## How it works
This is a Serverless app (well, bundle of scripts) run on AWS, interfacing with the Twitter API at a set interval to make sure tweets are captured. The app culls data from a Twitter list following all the relevant congressional accounts, the most anonymous way of following a Twitter account. If you follow this strategy (designed to minimizing chances of blocking), I recommend using an undetectable private Twitter list in combination with either a private Twitter account or a burner account you never use. To collect tweets, the app iterates through Twitter search queries.

To track tweets and a few other data points, the app uses a small JSON file that contains some stringified data that gets parsed when the app runs. To reduce unwieldiness, the app transforms the received Twitter tweet data into much smaller objects with a few properties like text, screen name, date, and id. Short and media URLs are unfurled in the text. The app also collects both retweets and full text of quoted tweets. At the end of the day (EST), the app empties out the previous day's tweet day into JSON dumps of tweets (generated using data from `users.json`, stored in the JSON file).

The app uses the Github API to commit JSON data (and a small MD file/Jekyll post for some frontend/RSS stuff) to the frontend repo. I have set up and recommend a secondary account so you do not have 30 extra commits at the end of the month on your page.

Previous versions of this app were designed to run on Heroku. The app has been simplified a bit, and a number of customization options have been removed.

### Maintenance
In addition to the app collating tweets from a list, there is a customizable maintenance process that allows for the easy updating and organization of user datasets and the Twitter list and bucket datastore powering the project. The maintenance process checks the local user datasets against the Twitter list, and current legislator and social media datasets from [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) to look for outdated information, and if there is any outdated info, will update the datasets accordingly. Server-side or with a JSON file, this process checks for reactivated and deactivated accounts, and deletes any accounts from the current user dataset that have been were deactivated long enough ago (more than 30 days) for Twitter to delete the account from its servers.

In addition to maintaining the datasets, the the process handles store and list initialization, and post-build updates of the store. Depending on the environment and configuration, the maintenance process can update files and/or store, and commit the updated datasets to Github with a message and body.

The maintenance process' behavior can be modified based on the options described below.

##### Options
There are a number of options that you can pass to the maintenance processes to customize its behavior. The options are passed as flags when running the maintenance process.

   
* **`postBuild`**: runs the maintenance process server-side to parse for post-build changes.
   
* **`selfUpdate`**: runs the self-updating maintenance process, which will check for changes in the list, remote datasets and revise local data accordingly.
   
* **`noCommit`**: allows for running the self-updating server-side maintenance process without triggering a commit. Revised datasets will be written to a file and the maintenance process is then called recursively with the post-build flag to update the store and list.
   
## Requisites
You'll need the following for this to work:
* AWS account
* Serverless account
* Twitter API and secret keys
* Twitter consumer and secret keys
* Twitter list (and list ID)
* Github API key
* Two Github repos: one for tweet datasets, one for user datasets 
* Node (currently 16x)
* Yarn
* Knowledge of APIs and the above things

## What is what

Located in `src/handlers`, there are three handler functions handling various parts of the app:

* **`checkUsers`** - Self-update process. Scheduled in the serverless config to run once daily. Will update the user repo if there are changes. Can pass in `noCommit` option to just update the bucket datastore.
* **`runApp`** - The main app which collects tweets. Scheduled to run hourly at top of the hour. Will initiate the bucket store if it is not already.
* **`updateData`** - A post-build type process mapped to a webhook API that runs after the user repo has been updated. Updates lists and tweets and such.

The breakdown of the actual app files other than handlers is as follows:

* `/src` - the directory with app source code
  * `app` - app class and methods for initialization and running
  * `maintenance` - store/list initialiation, server and local maintenance processes
  * `config` - configuration file containing various app settings
  * `github` - methods and such for interacting with Github API
  * `twitter` - methods, helpers, and such for interacting with Twitter API
  * `utils` - various utilities including time parsing, formatting, serialization, data, extraction et al
  * `changeMessage` - creating a message for the maintenance process
* `/tests` - unit tests, which correspond to a number of files in the src, as well as mock data, utils and a mock API helper

In the `/cli` directory, there is the source of a CLI app intended to reduce the friction for updating datasets further. It is not pre-built. To compile and run, I recommend `npx webpack build --config webpack.cli.js && node build/cli.js`.

## Installation

If you have Yarn installed, you can get started by forking the repo and/or cloning, and running `yarn init` and `yarn install` to install all the pertinent dependencies on your machine. (If not, install Yarn first.) You'll also need Serverless installed.

## Running the app
You'll need the following environmental variables set in a `.env` file in the directory to get things up and running. And set store those variables in AWS Parameter Store:
* TWITTER_API_KEY
* TWITTER_API_SECRET
* ACCESS_TOKEN
* ACCESS_TOKEN_SECRET
* LIST_ID
* GITHUB_TOKEN
* GITHUB_USER
 
Make sure you have Github repos set up for deployment, otherwise those parts of the app may fail.

You can run the app locally with Serverless or just deploy.

## Testing
To test the app, simply run `yarn test` to lint and run Jest tests and other fun stuff. As of V1, there's a mock API to handle the requests to Github content, Github's API and Twitter's API, and a variety of utilitie.

## Issues, etc.
If you come across any issues, don't hesitate to file any issue in this repo, make a pull request or [send an email](mailto:alexlitelATgmailDOTcom).

## Acknowledgements
* Dataset was created with the help of the [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) project.
* Thanks to [@likeigaveadam](https://twitter.com/LikeIGive_Adam) and [@sailorpsy](https://github.com/sailorpsy) for collating all the accounts for incoming members of the 116th Congress.
