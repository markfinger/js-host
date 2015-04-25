'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var winston = require('winston');
var _ = require('lodash');
var Func = require('./Func');

var Host = function Host(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);

  this.functions = Object.create(null);
  if (this.config.functions) {
    this.initFunctions();
  }

  this.listenerServer = null;
  this.listener = this.getListener();
  this.bindListener(this.listener);

  this.logger = this.getLogger();
};

Host.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '9009',
  silent: false,
  outputOnListen: true,
  requestDataLimit: '10mb',
  cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours,
  functions: null,
  logger: null
};

Host.prototype.addFunction = function addFunction(opts) {
  // Another object is created so that the host's config can
  // stay as clean as possible
  var _opts = _.defaults({
    cacheTimeout: this.config.cacheTimeout,
    host: this
  }, opts);

  var func = new Func(_opts);

  if (this.functions[func.name] !== undefined) {
    throw new Error('A function has already been defined with the name "' + func.name + '"');
  }

  this.functions[func.name] = func;

  return func;
};

Host.prototype.initFunctions = function initFunctions() {
  var functions = this.config.functions;

  // A transformation step which allows func configs to be written in
  // a variety of ways. Internally we use arrays of objects.
  if (!_.isArray(functions) && _.isObject(functions)) {
    functions = this.config.functions = _.map(functions, function(val, key) {
      var obj = _.isFunction(val) ? {handler:val} : val;
      obj.name = key;
      return obj;
    });
  }

  functions.forEach(this.addFunction, this);
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

  listener.param('function', this.getFunctionParam());

  listener.post('/function/:function',
      this.getFunctionCache(),
      this.getDataMiddleware(),
      this.getFunctionResponse()
  );

  return listener;
};

Host.prototype.getRequestLogMiddleware = function getRequestLogMiddleware() {
  return function requestLogMiddleware(req, res, next) {
    this.logger.info(req.method + ' ' + req.url);
    next();
  }.bind(this);
};

Host.prototype.getFunctionParam = function getFunctionParam() {
  return function functionParam(req, res, next, func) {
    req.func = this.functions[func];

    if (!req.func) {
      this.logger.info('Request for unknown function "' + func + '"');
      return res.status(404).end('Not found');
    }

    this.logger.info('Function: ' + func + ' requested');

    next();
  }.bind(this);
};

Host.prototype.getFunctionCache = function getFunctionCache() {
  return function functionCache(req, res, next) {
    var key = req.query['key'];
    if (key) {
      var cachedOutput = req.func.getCachedOutput(key);

      if (cachedOutput) {
        this.logger.info('Function: ' + req.func.name + ' - cache hit for key: ' + key);
        return res.end(cachedOutput);
      }

      this.logger.info('Function: ' + req.func.name + ' - cache miss for key: ' + key);

      res.locals.key = key;
    }
    next();
  }.bind(this);
};

Host.prototype.getDataMiddleware = function getDataMiddleware() {
  return bodyParser.json({
    limit: this.config.requestDataLimit
  });
};

Host.prototype.getFunctionResponse = function getFunctionResponse() {
  return function functionResponse(req, res) {
    var cb = this.functionCallbackFactory(res, req.func);

    this.logger.info('Calling function "' + req.func.name + '"');

    return req.func.call(req.body, res.locals.key, cb);
  }.bind(this);
};

Host.prototype.functionCallbackFactory = function functionCallbackFactory(res, func) {
  var called = false;
  return function functionCallback(err, output) {
    if (called) {
      err = new Error('Function "' + func.name + '" called its callback more than once');
      return this.logger.error(err.stack);
    }

    // Prevent the callback from being called a second time
    called = true;

    if (err) {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }
      this.logger.error('Function: ' + func.name, err.message, err.stack);
      return res.status(500).end(err.stack);
    }

    this.logger.info('Function: ' + func.name + ' completed');

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

      if (cb) cb(this);
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
  if (this.config.logger !== Host.prototype.defaultConfig.logger) {
    return this.config.logger;
  }

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