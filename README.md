js-host
=======

[![Build Status](https://travis-ci.org/markfinger/js-host.svg?branch=master)](https://travis-ci.org/markfinger/js-host)

Provides a configurable JavaScript host which exposes functions to network requests. Intended 
to provide the low-level bindings for other languages to access a JavaScript environment.

There are a variety of projects offering execution of JavaScript (ExecJS et al), but their performance
tends to lag as they typically spawn new environments on every call. 

Using a persistent JavaScript environment enables massive performance improvements as we can persist 
state across calls and avoid the overhead of spawning environments.

- [Installation](#installation)
- [Basic usage](#basic-usage)
- [Documentation](#documentation)
  - [CLI usage](#cli-usage)
  - [Config files](#config-files)
  - [Functions](#functions)
    - [Sending a success response](#sending-a-success-response)
    - [Handling errors](#handling-errors)
    - [Accessing the host from a function](#accessing-the-host-from-a-function)
  - [Logging](#logging)
  - [Calling functions via the network](#calling-functions-via-the-network)
  - [Endpoints](#endpoints)


Installation
------------

```
npm install js-host
```


Basic usage
-----------

Create a file `host.config.js` which will contain the configuration for the host.

```javascript
module.exports = {
  functions: {
    hello_world: function(data, cb) {
      cb(null, 'Hello, World!');
    }
  }
};
```

Start the host with:

```
node_modules/.bin/js-host host.config.js
```

And call `hello_world` by sending a POST request to `http://127.0.0.1:9009/function/hello_world`.


Documentation
-------------


### CLI usage

A `js-host` file is placed into `node_modules/.bin` which allows you to interact with library at
a high-level. Most of the interactions will require you to specify a path to a config file.

You can start a host process by invoking `js-host` with a config file. For example

```bash
node_modules/.bin/js-host host.config.js
```

The following arguments are accepted:

| &nbsp; | Alias | Description |
| :----- | :---- | :---------- |
| -c | --config | Read in the config file and output its generated config as JSON |
| -j | --json | Once the process has started, output its generated config as JSON |
| -p | --port | Override the config's port and run the process at the number specified |
| -l | --logfile | Adds a file transport to the process's logger which will write to the specified file |
| -m | --manager | Run a manager process, rather than a host |
| -d | --detached | Run in a detached process |
| -v | --version | Output the package's version |
| -h | --help | Output help text |

If you want run a host with an interactive debugger, you should start the host with 
[Node's debugger](https://nodejs.org/api/debugger.html). For example

```bash
node debug node_modules/.bin/js-host host.config.js
```

Place a `debugger` statement where you want to block the process and inspect the environment.


### Config files

Config files are simply JS files which export an object, for example:

```javascript
module.exports = {
  port: 8080,
  functions: {
    my_func: function(data, cb) {
      // ...
    }
  }
};
```

Config objects may possess the following properties:

`functions`: a key/value object with names -> functions.

`address`: the address that the host will listen at. Defaults to `'127.0.0.1'`.

`port`: the port number that the host will listen at. Defaults to `9009`.

`requestDataLimit`: the maximum size allowed for a request's body. Defaults to `'10mb'`.

`logger`: an object which will be used instead of the default logger. The object must provide a 
similar API to JavaScript's console object, eg: it must provide functions named `log`, `error`, 
`info`, etc. Defaults to `null`.

`disconnectTimeout`: the number of milliseconds that a manager will wait before stopping a host
without any open connections. Defaults to `5 * 1000 // 5 seconds`.

If you want to pass configuration to a function, you can add extra properties to the config object, 
and then access them in your function via the `this` binding. For example

```javascript
module.exports = {
  functions: {
    some_func: function(data, cb) {
      if (this.host.config.production) {
        // ...
      } else {
        // ...
      }
    }
  }
  production: true
};
```

If you want to use environment-specific config files, you can import a default file and then override
or add settings specific to that environment. For example

```javascript
var _ = require('lodash');
// Import your default config
var defaultConfig = require('./host.config');

module.exports = _.defaults({
  // Override the logger with one specific to this environment
  logger: // ...
}, defaultConfig);
```


### Functions

The functions definition of a host config is a simple map which enables network requests to be passed 
to functions. When a request is matched to a function, the function is called with two arguments:

- `data` is an object generated from deserializing any data sent in the request's body.
- `cb` is a function which enables you to indicate that your function has either completed successfully,
  or encountered an error. Following the argument pattern typical in function-based languages, `cb` 
  assumes that the first argument indicates an error, and the second argument indicates success.


#### Sending a success response

Once your function has completed successfully, you should pass a value to `cb` as the second
argument. For example:

```javascript
cb(null, {status: 'success'});
```

If the value provided as the second argument is falsey - `null`, `false`, `undefined`, `0` - the
host will assume that a mistake was made in your code, and will return an error response. 

Note: the value of the second argument is sent back to the caller as a text response. If the 
value is an object, it will be serialized to JSON. All non-object types are coerced to strings.


#### Handling errors

You should try to gracefully handle any errors encountered as uncaught errors may cause the host
to assume the worst and exit immediately. If you encounter an error condition, pass an `Error`
object to `cb`, and let the host handle it. If you need to execute code that may throw errors,
use a try/catch to pass the error to the host and then exit your function. For example:

```javascript
function(data, cb) {
  try {
    dangerousFunc();
  } catch(err) {
    return cb(err);
  }
  cb(null, 'ok');
};
```

Note: if you use a try/catch statement, remember to exit the function with `return` when sending 
errors back.

If you encounter a condition deserving of an error, always provide `Error` objects rather than 
strings. For example:

```javascript
// Bad
cb('Something bad happened');

// Good
cb(new Error('Something bad happened'));
```

By using Error objects, the host is able to provide an accurate stack trace, indicating the source 
of the error.


#### Accessing the host from a function

Functions can access the host via `this.host`. For example:

```javascript
// Write to the host's logs
function(data, cb) {
  this.host.logger.info('Something happened');
  this.host.logger.warn('Something bad might happen');
  this.host.logger.error('Something bad happened');
};
```

Note: the `this` binding will not be passed along to other functions that you may call.
You need to either pass values explicitly or pass the `this` binding along. For example:

```javascript
function(data, cb) {
  this.host.logger.info('Started my function');
  
  // Pass values explicitly
  logData(this.host.logger, data);
  
  // Create a new function which uses the outer `this` binding
  someAsyncFunc(function(err, res) {
    if (err) {
      this.host.logger.error('Something bad happened');
      return cb(err);
    }
    cb(null, res);
  }.bind(this));
}

function logData(logger, data) {
  logger.info('So much data...', data);
};
```

Note: the `this` binding of your function is generated per-request, hence any values that you may add to
the `this` object will not be passed along to other requests.


### Logging

By default, js-host instances will only write their logs to stdout and stderr. If you want the log 
output streamed to files, you are strongly recommended to define the `logger` property in your 
config file. 

Interally, js-host uses [winston](https://github.com/winstonjs/winston) as the default logger. If 
you define the `logger` property of your config, js-host will use your logger instead of its own. 
For example

```javascript
var winston = require('winston');

module.exports = {
  // ...
  logger: new winston.Logger({
    transports: [
      // Write to stdout and stderr
      new (winston.transports.Console)(),
      // Write to a file as well
      new (winston.transports.File)({ filename: 'somefile.log' })
    ]
  });
};
```


### Calling functions via the network

Functions are exposed to POST requests at the `/function/<name>` endpoint.

To send data: set the request's content-type to `application/json` and pass JSON as the request's body.

If the function indicated success, a 200 response will be returned with the function's output as the
response's text.

If the function returned an error condition, a 500 response will be returned, with a stack trace as 
the response's text.


### Endpoints

Hosts and managers communicate via HTTP and provide a number of endpoints that perform particular
functions.

Hosts use the following endpoints

| Method | Endpoint | Description |
| :----- | :------- | :---------- |
| GET | /status | Returns a JSON object describing the host and environment |
| POST | /function/&lt;name&gt; | Passes the request's body to the function matched to `<name>` and returns its output |

Managers use the following endpoints

| Method | Endpoint | Description |
| :----- | :------- | :---------- |
| GET | /status | Returns a JSON object describing the manager and environment |
| POST | /manager/stop | Causes the manager to stop every host and then stop its own process. Returns text |
| POST | /host/start | Starts a host. Returns a JSON object describing the host. [*](#manager-config-prop) |
| POST | /host/stop | Stops a host. Returns a JSON object describing the host. [*](#manager-config-prop) |
| POST | /host/restart | Restarts a host. Returns a JSON object describing the host. [*](#manager-config-prop) |
| POST | /host/status | Provides information about a host. Returns a JSON object indicating if the host is running and all information about it. [*](#manager-config-prop) |
| POST | /host/connect | Opens a new connection to a host. Returns a JSON object containing the connection identifier and information about the host. [*](#manager-config-prop) |
| POST | /host/disconnect | Closes a connection to a host. Returns a JSON object indicating if/when the host will be stopped. Requires a connection identifier as a `connection` property. [*](#manager-config-prop) |

<a name="manager-config-prop">
  *: requires a path to a config file to be specified as a `config` property on the request's body
</a>
