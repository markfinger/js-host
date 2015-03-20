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
  debug: false,
  logErrors: true,
  outputOnListen: true,
  bodyParserLimit: '10mb',
  cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours,
  services: null
};

Host.prototype.Service = Service;

Host.prototype.addService = function addService(service) {
  if (!(service instanceof this.Service)) {
    if (service.cacheTimeout === undefined) {
      service.cacheTimeout = this.config.cacheTimeout;
    }
    service = new this.Service(service);
  }

  if (this.services[service.name] !== undefined) {
    throw new Error('A service has already been defined with the name "' + service.name + '"');
  }

  this.services[service.name] = service;
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

  if (this.config.debug) {
    listener.get('*', this.debugGetHandler.bind(this));
  }

  listener.use(this.getAuthMiddleware());
  listener.use(this.getServiceMiddleware());
  listener.use(this.getDataMiddleware());
  listener.post('*', this.getServiceRouter());

  return listener;
};

Host.prototype.getAuthMiddleware = function getAuthMiddleware() {
  return function authMiddleware(req, res, next) {
    if (this.config.authToken && req.headers['x-auth-token'] !== this.config.authToken) {
      return res.status(401).end('Unauthorized');
    }
    next();
  }.bind(this);
};

Host.prototype.getServiceMiddleware = function getServiceMiddleware() {
  return function serviceMiddleware(req, res, next) {
    var name = req.headers['x-service'];
    var service = this.services[name];
    if (service === undefined) {
      if (this.config.debug) {
        return res.status(404).end(
          'Service not found. Services available via the X-SERVICE header: ' + JSON.stringify(Object.keys(this.services))
        );
      }
      return res.status(404).end('Not found');
    }
    var cacheKey = req.headers['x-cache-key'];
    if (cacheKey) {
      var cachedOutput = service.getCachedOutput(cacheKey);
      if (cachedOutput) {
        res.end(cachedOutput);
      }
    }
    res.locals.cacheKey = cacheKey;
    res.locals.service = service;
    next();
  }.bind(this);
};

Host.prototype.getDataMiddleware = function getDataMiddleware() {
  return bodyParser.json({
    limit: this.config.bodyParserLimit
  });
};

Host.prototype.getServiceRouter = function getServiceRouter() {
  return function serviceRouter(req, res) {
    var done = this.doneFactory(res);
    return res.locals.service.call(req.body, res.locals.cacheKey, done);
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

Host.prototype.debugGetHandler = function debugGetHandler(req, res) {
  var serviceNames = Object.keys(this.services);
  var output = '<html><body><h1>Services</h1>';
  if (serviceNames.length) {
    output += '<ul><li>' + serviceNames.join('</li></li>') + '</li></ul>';
  } else {
    output += '<p>No services have been added</p>';
  }
  output += '</body></html>';
  res.end(output);
};

Host.prototype.doneFactory = function doneFactory(res) {
  var called = false;
  return function done(err, output) {
    if (called) {
      return this.onError('`done` callback was called more than once');
    }
    called = true;
    if (err) {
      return this.errorResponse(err, res);
    }
    res.end(output);
  }.bind(this);
};

module.exports = Host;