var express = require('express');
var bodyParser = require('body-parser');
var debug = require('debug');
var _ = require('lodash');
var Service = require('./Service');

var Host = function Host(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);
  this.services = Object.create(null);

  this.listenerServer = null;
  this.listener = this.getListener();
  this.bindListener(this.listener);

  this.log = this.getLog();
  this.errorLog = this.getErrorLog();

  if (this.config.services) {
    this.initServices();
  }
};

Host.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '63578',
  silent: false,
  outputOnListen: true,
  requestDataLimit: '10mb',
  serviceCacheTimeout: null,
  services: null
};

Host.prototype.Service = Service;

Host.prototype.serviceNameHeader = 'X-Service';
Host.prototype.cacheKeyHeader = 'X-Cache-Key';

Host.prototype.addService = function addService(service) {
  if (!(service instanceof this.Service)) {
    service = new this.Service(service);
  }
  if (this.config.serviceCacheTimeout) {
    service.cacheTimeout = this.config.serviceCacheTimeout;
  }
  if (this.config.silent) {
    service.silent = this.config.silent;
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
  return express();
};

Host.prototype.bindListener = function bindListener(listener) {
  listener.use(this.getRequestLogMiddleware());

  listener.use.apply(listener, this.getMiddleware());

  return listener;
};

Host.prototype.getRequestLogMiddleware = function getRequestLogMiddleware() {
  return function requestLogMiddleware(req, res, next) {
    this.log(req.method + ' ' + req.url);
    next();
  }.bind(this);
};

Host.prototype.getMiddleware = function() {
  return [
    this.getServiceLookupMiddleware(),
    this.getServiceCacheMiddleware(),
    this.getServiceDataMiddleware(),
    this.getServiceResponseMiddleware()
  ];
};

Host.prototype.getServiceLookupMiddleware = function getServiceLookupMiddleware() {
  var serviceNameHeader = this.serviceNameHeader.toLowerCase();
  return function serviceLookupMiddleware(req, res, next) {
    var name = req.headers[serviceNameHeader];
    var service = this.services[name];
    if (service === undefined) {
      this.log('Unknown service: ' + name);
      return res.status(404).end('Not found');
    }
    this.log('Service: ' + name, 'Requested');
    res.locals.service = service;
    next();
  }.bind(this);
};

Host.prototype.getServiceCacheMiddleware = function getServiceCacheMiddleware() {
  var cacheKeyHeader = this.cacheKeyHeader.toLowerCase();
  return function serviceMiddleware(req, res, next) {
    var cacheKey = req.headers[cacheKeyHeader];
    if (cacheKey) {
      var cachedOutput = res.locals.service.getCachedOutput(cacheKey);
      if (cachedOutput) {
        this.log('Service: ' + res.locals.service.name, 'Cache hit for key: ' + cacheKey);
        return res.end(cachedOutput.toString());
      }
      this.log('Service: ' + res.locals.service.name, 'Cache miss for key: ' + cacheKey);
      res.locals.cacheKey = cacheKey;
    }
    next();
  }.bind(this);
};

Host.prototype.getServiceDataMiddleware = function getServiceDataMiddleware() {
  return bodyParser.json({
    limit: this.config.requestDataLimit
  });
};

Host.prototype.getServiceResponseMiddleware = function getServiceResponseMiddleware() {
  return function serviceResponseMiddleware(req, res, next) {
    if (req.method === 'POST') {
      var service = res.locals.service;
      var done = this.serviceDoneFactory(res, service);
      this.log('Service: ' + service.name, 'Calling service');
      return service.call(req.body, res.locals.cacheKey, done);
    }
    next();
  }.bind(this);
};

Host.prototype.serviceDoneFactory = function serviceDoneFactory(res, service) {
  var called = false;
  return function done(err, output) {
    if (called) {
      return this.errorLog('Service :' + service.name, 'done callback was called more than once');
    }
    called = true;
    if (err) {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }
      this.errorLog('Service: ' + service.name, err.stack);
      return res.status(500).end(err.stack);
    }
    this.log('Service: ' + service.name, 'Completed');
    res.end(output.toString());
  }.bind(this);
};

Host.prototype.onListenOutput = function onListenOutput() {
  return 'Host listening at ' + this.getAddress() + '\n';
};

Host.prototype.listen = function(cb) {
  if (this.listenerServer) {
    return console.warn(
      'Host already listening at ' + this.getAddress()
    );
  }

  this.listenerServer = this.listener.listen(
    this.config.port,
    this.config.address,
    function() {
      if (this.config.outputOnListen) {
        process.stdout.write(this.onListenOutput());
      }
      if (cb) {
        cb();
      }
    }.bind(this)
  );
};

Host.prototype.stopListening = function stopListening() {
  if (this.listenerServer) {
    this.log('Stopping listener');
    this.listenerServer.close();
    this.listenerServer = null;
  }
};

Host.prototype.getAddress = function getAddress() {
  return this.config.address + ':' + this.config.port;
};

Host.prototype.getUrl = function getUrl() {
  return 'http://' + this.getAddress();
};

Host.prototype.getLog = function getLog() {
  debug.enable('host:log');
  var log = debug('host:log');
  log.log = console.log.bind(log);
  return function() {
    if (!this.config.silent) {
      log.apply(log, arguments);
    }
  }.bind(this);
};

Host.prototype.getErrorLog = function getErrorLog() {
  debug.enable('host:error');
  var errorLog = debug('host:error');
  return function() {
    if (!this.config.silent) {
      errorLog.apply(errorLog, arguments);
    }
  }.bind(this);
};

module.exports = Host;