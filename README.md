# qewd-require-json

Load configuration JSON file based on environment value

[![Build Status](https://travis-ci.org/killmenot/qewd-require-json.svg?branch=master)](https://travis-ci.org/killmenot/qewd-require-json) [![Coverage Status](https://coveralls.io/repos/github/killmenot/qewd-require-json/badge.svg?branch=master)](https://coveralls.io/github/killmenot/qewd-require-json?branch=master)

## Usage

```
 |
 |-- bar
   |-- config.json
 |-- config.developent.json
 |-- config.integration.json
 |-- config.json
```

```js
const requireJsonFactory = require('qewd-require-json');
const requireJson = requireJsonFactory();

// basic
const config = requireJson('./config.json') // config.json loaded

// pass version via NODE_ENV
process.env.NODE_ENV = 'development';
const config = requireJson('./config.json') // config.development.json is loaded

// pass version via TEST_ENV
process.env.NODE_ENV = 'staging';
process.env.TEST_ENV = 'integration';
const config = requireJson('./config.json') // config.integration.json is loaded

// overwrite cwd via options
const options = { cwd: '/path/to/bar' }
const requireJson = requireJsonFactory(options);
const config = requireJson('./config.json') // config.json from bar folder is loaded
```
