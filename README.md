js-host
=======

[![Build Status](https://travis-ci.org/markfinger/js-host.svg?branch=master)](https://travis-ci.org/markfinger/js-host)

Provides a configurable JavaScript host which exposes functions to network requests. Intended 
to provide the low-level bindings for other languages to access a JavaScript environment.

There are a variety of projects offering execution of JavaScript (ExecJS et al), but their performance
tends to lag as they typically spawn new environments on every call. 

Using a persistent JavaScript environment enables massive performance improvements as we can persist 
state across calls and avoid the overhead of spawning environments.


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


Functions
---------

The functions definition of a host config is a simple map which enables network requests to be passed 
to functions. When a request is matched to a function, the function is called with two arguments:

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

You should try to gracefully handle any errors encountered as uncaught errors may cause the host
to assume the worst and exit immediately. If you encounter an error condition, pass an `Error`
object to `cb`, and let the host handle it. If you need to execute code that may throw errors,
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

`functions`: a key/value object with names -> functions.

`address`: the address that the host will listen at. Defaults to `'127.0.0.1'`.

`port`: the port number that the host will listen at. Defaults to `9009`.

`requestDataLimit`: The maximum size allowed for a request's body. Defaults to `'10mb'`.

`logger`: An object which will be used instead of the default logger. The object must provide a similar API to
the `console` object, eg: it must provide functions named `log`, `error`, `info`, etc.


Calling a function
------------------

Functions are exposed to POST requests at the `/function/<name>` endpoint.

To send data: set the request's content-type to `application/json` and pass JSON as the request's body.
