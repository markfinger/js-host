'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var winston = require('winston');
var _ = require('lodash');
var Service = require('./Service');

var Host = function Host(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);
  this.services = Object.create(null);

  this.listenerServer = null;
  this.listener = this.getListener();
  this.bindListener(this.listener);

  this.logger = this.getLogger();

  if (this.config.services) {
    this.initServices();
  }
};

Host.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '9009',
  silent: false,
  outputOnListen: true,
  requestDataLimit: '10mb',
  cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours,
  services: null,
  logger: null
};

Host.prototype.addService = function addService(opts) {
  // Another object is created so that the config
  // can stay as clean as possible
  var _opts = _.defaults({
    cacheTimeout: this.config.cacheTimeout,
    host: this
  }, opts);

  var service = new Service(_opts);

  if (this.services[service.name] !== undefined) {
    throw new Error('A service has already been defined with the name "' + service.name + '"');
  }

  this.services[service.name] = service;

  return service;
};

Host.prototype.initServices = function initServices() {
  this.config.services.forEach(this.addService, this);
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

  listener.get('/type', function(req, res) {
    res.end('Host');
  }.bind(this));

  listener.get('/config', function(req, res) {
    res.json(this.config);
  }.bind(this));

  listener.param('service', this.getServiceParam());

  listener.post('/service/:service',
      this.getServiceCache(),
      this.getDataMiddleware(),
      this.getServiceResponse()
  );

  return listener;
};

Host.prototype.getRequestLogMiddleware = function getRequestLogMiddleware() {
  return function requestLogMiddleware(req, res, next) {
    this.logger.info(req.method + ' ' + req.url);
    next();
  }.bind(this);
};

Host.prototype.getServiceParam = function getServiceParam() {
  return function serviceParam(req, res, next, service) {
    req.service = this.services[service];
    if (!req.service) {
      this.logger.info('Request for unknown service "' + service + '"');
      return res.status(404).end('Not found');
    }
    this.logger.info('Service: ' + service + ' requested');
    next();
  }.bind(this);
};

Host.prototype.getServiceCache = function getServiceCache() {
  return function serviceCache(req, res, next) {
    var cacheKey = req.query['cache-key'];
    if (cacheKey) {
      var cachedOutput = req.service.getCachedOutput(cacheKey);
      if (cachedOutput) {
        this.logger.info('Service: ' + req.service.name + ' - cache hit for key: ' + cacheKey);
        return res.end(cachedOutput.toString());
      }
      this.logger.info('Service: ' + req.service.name + ' - cache miss for key: ' + cacheKey);
      res.locals.cacheKey = cacheKey;
    }
    next();
  }.bind(this);
};

Host.prototype.getDataMiddleware = function getDataMiddleware() {
  return bodyParser.json({
    limit: this.config.requestDataLimit
  });
};

Host.prototype.getServiceResponse = function getServiceResponse() {
  return function serviceResponse(req, res) {
    var done = this.serviceDoneFactory(res, req.service);
    this.logger.info('Service: ' + req.service.name + ' - calling service');
    return req.service.call(req.body, res.locals.cacheKey, done);
  }.bind(this);
};

Host.prototype.serviceDoneFactory = function serviceDoneFactory(res, service) {
  var called = false;
  return function serviceDone(err, output) {
    if (called) {
      return this.logger.error('Service: ' + service.name + ' - done callback was called more than once');
    }
    called = true;
    if (err) {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }
      this.logger.error('Service: ' + service.name, err.message, err.stack);
      return res.status(500).end(err.stack);
    }
    this.logger.info('Service: ' + service.name + ' completed');
    res.end(output.toString());
  }.bind(this);
};

Host.prototype.onListenOutput = function onListenOutput() {
  return 'Host listening at ' + this.getAddress() + '\n';
};

Host.prototype.listen = function(cb) {
  if (this.listenerServer) {
    return this.logger.warn(
      'Host already listening at ' + this.getAddress()
    );
  }

  this.listenerServer = this.listener.listen(
    this.config.port,
    this.config.address,
    function() {
      // If an open/random port was chosen, update the config
      if (this.config.port.toString() === '0') {
        this.config.port = this.listenerServer.address().port;
      }
      if (this.config.outputOnListen) {
        process.stdout.write(this.onListenOutput());
      }
      if (cb) {
        cb(this);
      }
    }.bind(this)
  );
};

Host.prototype.stopListening = function stopListening() {
  if (this.listenerServer) {
    this.logger.info('Stopping listener');
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

Host.prototype.getLogger = function getLogger() {
  if (this.config.logger) return this.config.logger;

  if (this.config.silent) {
    return new winston.Logger({
      exitOnError: false,
      transports: []
    });
  }

  return new winston.Logger({
    exitOnError: true,
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        silent: this.config.silent,
        colorize: true,
        timestamp: true,
        prettyPrint: true,
        showLevel: true
      })
    ]
  });
};

module.exports = Host;