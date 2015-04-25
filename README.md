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
      cb(null, output);
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
