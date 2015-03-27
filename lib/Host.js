var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
var Service = require('./Service');

var Host = function Host(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);
  this.services = Object.create(null);
  this.isListening = false;
  this.listenerServer = null;
  this.listener = this.getListener();

  if (this.config.services) {
    this.initServices();
  }
};

Host.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '63578',
  authToken: null,
  logErrors: true,
  outputOnListen: true,
  requestDataLimit: '10mb',
  serviceCacheTimeout: 24 * 60 * 60 * 1000, // 24 hours
  services: null
};

Host.prototype.Service = Service;

Host.prototype.addService = function addService(service) {
  if (!(service instanceof this.Service)) {
    if (service.cacheTimeout === undefined) {
      service.cacheTimeout = this.config.serviceCacheTimeout;
    }
    service = new this.Service(service);
  }

  if (this.services[service.name] !== undefined) {
    throw new Error('A service has already been defined with the name "' + service.name + '"');
  }

  this.services[service.name] = service;

  return service;
};

Host.prototype.initServices = function initServices() {
  this.config.services.forEach(function(service) {
    service.handler = require(service.file);
    this.addService(service);
  }, this);
};

Host.prototype.callService = function callService(name, data, cacheKey, cb) {
  var service = this.services[name];
  if (!service) {
    return cb('Cannot find a service named "' + name + '"');
  }

  // Allow `data` and `cacheKey` to be optional arguments
  if (_.isFunction(cacheKey)) {
    cb = cacheKey;
    cacheKey = undefined;
  } else if (_.isFunction(data)) {
    cb = data;
    data = {};
  }

  // Ensure that the service always receives an object
  data = data || {};

  service.call(data, cacheKey, cb);
};

Host.prototype.getListener = function getListener() {
  var listener = express();

  listener.use.apply(listener, this.getMiddleware());

  return listener;
};

Host.prototype.getMiddleware = function() {
  return [
    this.getAuthMiddleware(),
    this.getServiceLookupMiddleware(),
    this.getServiceCacheMiddleware(),
    this.getServiceDataMiddleware(),
    this.getServiceResponseMiddleware()
  ];
};

Host.prototype.getAuthMiddleware = function getAuthMiddleware() {
  return function authMiddleware(req, res, next) {
    if (this.config.authToken && req.headers['x-auth-token'] !== this.config.authToken) {
      return res.status(401).end('Unauthorized');
    }
    next();
  }.bind(this);
};

Host.prototype.getServiceLookupMiddleware = function getServiceLookupMiddleware() {
  return function serviceLookupMiddleware(req, res, next) {
    var name = req.headers['x-service'];
    var service = this.services[name];
    if (service === undefined) {
      return res.status(404).end('Not found');
    }
    res.locals.service = service;
    next();
  }.bind(this);
};

Host.prototype.getServiceCacheMiddleware = function getServiceCacheMiddleware() {
  return function serviceMiddleware(req, res, next) {
    var cacheKey = req.headers['x-cache-key'];
    if (cacheKey) {
      var cachedOutput = res.locals.service.getCachedOutput(cacheKey);
      if (cachedOutput) {
        res.end(cachedOutput.toString());
      }
      res.locals.cacheKey = cacheKey;
    }
    next();
  };
};

Host.prototype.getServiceDataMiddleware = function getServiceDataMiddleware() {
  return bodyParser.json({
    limit: this.config.requestDataLimit
  });
};

Host.prototype.getServiceResponseMiddleware = function getServiceResponseMiddleware() {
  return function serviceResponseMiddleware(req, res, next) {
    if (req.method === 'POST') {
      var done = this.serviceDoneFactory(res);
      return res.locals.service.call(req.body, res.locals.cacheKey, done);
    }
    next();
  }.bind(this);
};

Host.prototype.serviceDoneFactory = function serviceDoneFactory(res) {
  var called = false;
  return function done(err, output) {
    if (called) {
      return this.onError('`done` callback was called more than once');
    }
    called = true;
    if (err) {
      return this.errorResponse(err, res);
    }
    res.end(output.toString());
  }.bind(this);
};

Host.prototype.listen = function(cb) {
  if (this.isListening) {
    return console.warn(
      'Host already listening at ' + this.config.address + ':' + this.config.port
    );
  }

  this.listenerServer = this.listener.listen(
    this.config.port,
    this.config.address,
    function() {
      if (this.config.outputOnListen) {
        console.log('Server listening at ' + this.config.address + ':' + this.config.port);
      }
      if (cb) {
        cb();
      }
    }.bind(this)
  );

  this.isListening = true;
};

Host.prototype.stopListening = function stopListening() {
  if (this.isListening) {
    this.listenerServer.close();
    this.isListening = false;
  }
};

Host.prototype.onError = function onError(err) {
  if (!(err instanceof Error)) {
    err = new Error(err);
  }
  if (this.config.logErrors) {
    console.error(err.stack);
  }
};

Host.prototype.errorResponse = function handleError(err, res) {
  if (!(err instanceof Error)) {
    err = new Error(err);
  }
  this.onError(err);
  res.status(500).end(err.stack);
};

Host.prototype.getUrl = function getUrl() {
  return 'http://' + this.config.address + ':' + this.config.port;
};

module.exports = Host;