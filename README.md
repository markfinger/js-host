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
      
      if (err) {
        // Send an error response back
        return cb(err);
      }
      
      var obj = {
        // ...
      };
      
      // Return a success response with data
      cb(null, JSON.stringify(someObj));
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
eg `/service/some-service?cache-key=<key>`.

If a cache key is provided, all concurrent requests using the some key will be
wait until the first resolves, and then receive the output of the first request.
All subsequent requests will resolve to the same output until it has expired.
