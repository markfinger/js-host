var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
var Service = require('./Service');

var Manager = function Manager(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);
  this.services = Object.create(null);
  this.isListening = false;
  this.server = null;
  this.app = null;
};

Manager.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '63578',
  logErrors: true,
  outputOnListen: true,
  bodyParserLimit: '10mb',
  debug: false
};

Manager.prototype.Service = Service;

Manager.prototype.addService = function addService(service) {
  if (!(service instanceof this.Service)) {
    service = new this.Service(service);
  }

  if (this.services[service.name] !== undefined) {
    throw new Error('A service has already been defined with the name "' + service.name + '"');
  }

  this.services[service.name] = service;
};

Manager.prototype.callService = function callService(name, data, cacheKey, cb) {
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

Manager.prototype.listen = function(cb) {
  if (this.isListening) {
    return console.warn(
      'Manager already listening at ' + this.config.address + ':' + this.config.port
    );
  }

  this.app = express();

  if (this.config.debug) {
    this.app.get('*', this.debugGetHandler.bind(this));
  }

  // TODO: consolidate service middleware
  // TODO: add extra check for json content-type
  this.app.use(this.serviceNameMiddleware.bind(this));
  this.app.use(this.serviceCacheMiddleware.bind(this));

  this.app.use(bodyParser.json({
    limit: this.config.bodyParserLimit
  }));

  this.app.post('*', this.serviceRouter.bind(this));

  this.server = this.app.listen(
    this.config.port,
    this.config.address,
    function() {
      if (this.config.outputOnListen) {
        console.log('Server listening at ' + this.config.address + ':' + this.config.port);
      }
      cb();
    }.bind(this)
  );

  this.isListening = true;
};

Manager.prototype.stopListening = function stopListening() {
  if (this.isListening) {
    this.server.close();
    this.isListening = false;
  }
};

Manager.prototype.serviceNameMiddleware = function serviceNameMiddleware(req, res, next) {
  var name = req.url.slice(1);
  res.locals.service = this.services[name];
  if (!res.locals.service) {
    return res.status(404).end('Not found');
  }
  next();
};

Manager.prototype.serviceCacheMiddleware = function serviceCacheMiddleware(req, res, next) {
  res.locals.cacheKey = req.headers['x-cache-key'];
  if (res.locals.cacheKey) {
    var cachedOutput = res.locals.service.getCachedOutput(res.locals.cacheKey);
    if (cachedOutput) {
      res.end(cachedOutput);
    }
  }
  next();
};

Manager.prototype.onError = function onError(err) {
  if (!(err instanceof Error)) {
    err = new Error(err);
  }
  if (this.config.logErrors) {
    console.error(err.stack);
  }
};

Manager.prototype.errorResponse = function handleError(err, res) {
  if (!(err instanceof Error)) {
    err = new Error(err);
  }
  this.onError(err);
  res.status(500).end(err.stack);
};

Manager.prototype.debugGetHandler = function debugGetHandler(req, res) {
  res.end(
    '<html>' +
    '<body>' +
      '<h1>Services</h1>' +
      '<ul>' +
        '<li>' +
          Object.keys(this.services).join('</li></li>') +
        '</li>' +
      '</ul>' +
    '</body>' +
    '</html>'
  );
};

Manager.prototype.doneFactory = function doneFactory(res) {
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

Manager.prototype.serviceRouter = function serviceRouter(req, res) {
  return res.locals.service.call(
    req.body,
    res.locals.cacheKey,
    this.doneFactory(res)
  );
};

module.exports = Manager;