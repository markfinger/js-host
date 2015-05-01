'use strict';

var _ = require('lodash');
var BaseServer = require('./BaseServer');
var Func = require('./Func');

var Host = function Host(config) {
  BaseServer.call(this, config);

  this.functions = Object.create(null);

  if (this.config.functions) {
    _.forOwn(this.config.functions, function(func, name) {
      this.addFunction(name, func);
    }, this);
  }
};

Host.prototype = Object.create(BaseServer.prototype);

Host.prototype.constructor = Host;

Host.prototype.defaultConfig = _.defaults({
  functions: null,
  requestDataLimit: '10mb'
}, BaseServer.prototype.defaultConfig);

Host.prototype.getSerializableConfig = function getSerializableConfig() {
  var serializableConfig = BaseServer.prototype.getSerializableConfig.call(this);

  // Convert `functions` to an array of names
  return _.mapValues(serializableConfig, function(val, key) {
    if (key === 'functions' && val) {
      return Object.keys(val);
    }
    return val;
  });
};

Host.prototype.addFunction = function addFunction(name, func) {
  if (this.functions[name] !== undefined) {
    throw new Error('A function has already been defined with the name "' + name + '"');
  }

  this.functions[name] = new Func(name, func);

  return this.functions[name];
};

Host.prototype.bindListener = function bindListener(listener) {
  BaseServer.prototype.bindListener.call(this, listener);

  listener.param('function', function functionLookup(req, res, next, funcName) {
    var func = this.functions[funcName];

    if (!func) {
      this.logger.info('Request for unknown function "' + funcName + '"');
      return res.status(404).end('Not found. Unknown function "' + funcName + '"');
    }

    res.locals.func = func;

    next();
  }.bind(this));

  listener.post('/function/:function', function callFunction(req, res) {
    var func = res.locals.func;

    this.logger.info('Calling function "' + func.name + '"');

    var data = req.body;

    var context = {
      name: func.name,
      host: func,
      req: req,
      res: res
    };

    func.call(context, data, this.functionCallbackFactory(context, func));
  }.bind(this));
};

Host.prototype.functionCallbackFactory = function functionCallbackFactory(context, func) {
  var called = false;
  return function functionCallback(err, output) {
    if (called) {
      err = new Error('Function "' + func.name + '" called its callback more than once');
      return this.logger.error(err.stack);
    }

    // Prevent the callback from being called a second time
    called = true;

    var res = context.res;

    if (err) {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }

      this.logger.error('Function: ' + func.name, err.stack);

      return res.status(500).end(err.stack);
    }

    this.logger.info('Function: ' + func.name + ' completed');

    res.end(output.toString());
  }.bind(this);
};

module.exports = Host;