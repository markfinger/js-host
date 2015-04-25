service-host
============

[![Build Status](https://travis-ci.org/markfinger/service-host.svg?branch=master)](https://travis-ci.org/markfinger/service-host)

Provides a configurable JavaScript host which exposes your services to network requests.


Installation
------------

```
npm install service-host
```


Basic usage
-----------

Create a file `services.config.js` containing the following:

```javascript
module.exports = {
  services: {
    some_service: function(data, cb) {
      // Send an error response
      if (err) return cb(new Error('Something bad occurred'));
      
      // Send a success response with data
      cb(null, {message: 'hello'});
    }
  }
});
```

Start a host using your config with:

```
node node_modules/.bin/service-host services.config.js
```


Configuration
-------------

Config files are simply JS files which export a config object, for example:

```javascript
module.exports = {
  port: 8000,
  services: {
    some_service: function(data, cb) {
      // ...
    }
  }
};
```

Config objects may possess the following attributes:

`address`: the address that the host will listen at. Defaults to `'127.0.0.1'`.

`port`: the port number that the host will listen at. Defaults to `9009`.

`requestDataLimit`: The maximum size allowed for a request body. Defaults to `'10mb'`.

`cacheTimeout`: The time period in milliseconds before the cache will expire an entry. Defaults to 24 hours.

`logger`: An object which will be used instead of the default logger. The object must provide a similar API to the `console` object, eg: it must provide functions named `log`, `error`, `info`, etc.

`services`: an key/value object with service names as keys and functions as values. Alternatively, values may be objects which provide the service's function as a property named `handler`.


Services
--------

Services are functions which accept two arguments, `data` and `cb`.

`data` is the deserialized body of the incoming request.

`cb` is a function which should be called once the service has completed. The function
will assume that the first argument indicates an error, and the second argument indicates 
success.

### Handling errors

Generally, you should try to avoid throwing errors during a request. Rather, try/catch
any potentially dangerous code and pass the caught error to the `cb` as the first argument.
For example:

```javascript
try {
  // Dangerous code
  // ...
} catch(err) {
  return cb(err);
}
```

### Handling success

Once your service has completed successfully, you should pass a value to `cb` as the 
second argument. For example:

```javascript
cb(null, {status: 'success'});
```

The success object can be of any type, but beware that it will either by serialized to JSON
or corced to a string.

### Accessing the host from a service

Services have access to the host via `this.host`. For example:

```javascript
// To write to the host's logs from a service

function(data, cb) {
  this.host.logger.log('Some message');
  this.host.logger.warn('Some warning');
  this.host.logger.error('Some error');
};
```

If you want to access the host from another function, you need to bind the `this` value to
the function calls. For example:

```javascript
// The service
function(data, cb) {
  logSomething.call(this, data);
}

// Another function
function logSomething(data) {
  this.host.logger.info('So much data...', data);
}
```

Note: the `this` binding of a service is generated per-request. Values added to the `this` 
object are not passed to other requests.


Calling the services
--------------------

Services are exposed to POST requests at the `/service/<name>` endpoint.

To send data: add a `content-type` header set to `application/json` and 
pass JSON as the request's body.

Service output can be optionally cached by adding a `cache-key` query param to 
your requests, for example:

```
/service/some-service?cache-key=<key>
```

If concurrent requests for a service use the same `cache-key` param, the first 
request will trigger the call to the service, and the other requests will be 
blocked until the first has resolved.

If a `cache-key` param is provided and the service provides a success response, all 
subsequent requests will resolve to the same output until the output has expired.

If a `cache-key` param is provided and the service provides an error response, all 
concurrent requests will receive the error. Note: errors responses are not cached.
