js-host
=======

[![Build Status](https://travis-ci.org/markfinger/js-host.svg?branch=master)](https://travis-ci.org/markfinger/js-host)

Provides a configurable JavaScript host which exposes functions to network requests. Intended 
to provide the low-level bindings for other languages to access a JavaScript environment.

There are a variety of projects offering execution of JavaScript (ExecJS et al), but their performance
tends to lag as they typically spawn new environments on every call. By using a persistent JavaScript 
environment, we gain massive performance improvements and the ability to persist state.

Behind the scenes, Node is used to provide a platform with an enormous ecosystem, robust
support for asynchronous programming, and solid debugging capabilities.

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
  port: 9009,
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


Functions
---------

Typical JavaScript functions which the hosts exposes to incoming requests. When a request is matched to a
function, it is called with two arguments:

- `data` is an object generated from deserializing the data sent in the request.
- `cb` is a function which enables you to indicate that your function has either completed successfully,
  or encountered an error. `cb` assumes that the first argument indicates an error, and the second argument
  indicates success.


### Handling success

Once your function has completed successfully, you should pass a value to `cb` as the second
argument. For example:

```javascript
cb(null, {status: 'success'});
```

Note: the value of the second argument is sent back to the caller as a text response. If the 
value is an object, it will be serialized to JSON. Types other than objects will be coerced to 
strings.


### Handling errors

You should try to gracefully handle any errors encountered as uncaught errors will cause the host
to assume the worst and exit immediately. If you encounter an error condition, pass an `Error`
instance to `cb`, and let the host handle it. If you need to execute code that may throw errors,
use a try/catch, pass the error to the host, and exit your function. For example:

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


### Accessing the host from a function

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


Config files
------------

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

Config objects may possess the following attributes:

`address`: the address that the host will listen at. Defaults to `'127.0.0.1'`.

`port`: the port number that the host will listen at. Defaults to `9009`.

`requestDataLimit`: The maximum size allowed for a request's body. Defaults to `'10mb'`.

`cacheTimeout`: The time period in milliseconds before the cache will expire an entry. Defaults to 24 hours.

`logger`: An object which will be used instead of the default logger. The object must provide a similar API to
the `console` object, eg: it must provide functions named `log`, `error`, `info`, etc.

`functions`: a key/value object with function names as keys and functions as values. Values may also be
objects which expose a function under a property named `handler`.


Calling a function
------------------

Functions are exposed to POST requests at the `/function/<name>` endpoint.

To send data: set the request's content-type to `application/json` and pass JSON as the request's body.

Function output can be optionally cached by adding a `key` query param to your requests, for example:
`/function/my_func?key=<key>`.

If a `key` is provided and the function provides a success response, all subsequent requests will
resolve to the same output until the cache expires it.

Note: if concurrent requests for a function use the same `key` param, the first request will trigger
the call to the function, and the other requests will be blocked until the first has completed. Once
the function signals completion, all concurrent requests are provided with either the error or success
output.
