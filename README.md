service-host
============

[![Build Status](https://travis-ci.org/markfinger/service-host.svg?branch=master)](https://travis-ci.org/markfinger/service-host)


Installation
------------

```
npm install service-host
```

Usage
-----

Create a file `services.config.js` containing the following:

```javascript
module.exports = {
  // The port that the host will listen at
  port: '9009',
  // The services that will be available
  services: [{
    name: 'some-service',
    handler: function(data, cb) {
      // ...
      
      // Send an error response
      if (err) return cb(err);
      
      var output = JSON.stringify({
        // ...
      });
      
      // Send a success response with data
      cb(null, output);
    }
  }]
});
```

Config files are normal JS files, so you can `require` libraries and expose 
whatever functionality you want.

Once you have configured the host, you can start the host by calling:

```bash
node_modules/.bin/service-host services.config.js
```

The host will validate the config, then start listening at the designated 
port. Once the host is listening, you can start calling the services.


Communicating with the host
---------------------------

Services are exposed at the `/service/<name>` endpoint, via POST requests.

To send data, add a `content-type` header set to `application/json`, and pass
serialized JSON as the request's body.

Service output can be optionally cached by adding a `cache-key` param, 
for example:
```
/service/some-service?cache-key=<key>
```

If concurrent requests use the same `cache-key` param, the first request
will trigger the call to the service, and the other requests will be blocked 
until the first has resolved.

If a `cache-key` param is provided and the service provides a success response, all 
subsequent requests will resolve to the same output until the output has expired.
