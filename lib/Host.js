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

  if (this.config.extendHost) {
    this.config.extendHost(this);
  }
};

Host.prototype = Object.create(BaseServer.prototype);

Host.prototype.constructor = Host;

Host.prototype.defaultConfig = _.defaults({
  functions: null
}, BaseServer.prototype.defaultConfig);

Host.prototype.addFunction = function addFunction(name, func) {
  if (this.functions[name] !== undefined) {
    throw new Error('A function has already been defined with the name "' + name + '"');
  }

  this.functions[name] = new Func(name, func);

  return this.functions[name];
};

Host.prototype.bindApp = function bindApp(app) {
  BaseServer.prototype.bindApp.call(this, app);

  app.param('function', function functionLookup(req, res, next, funcName) {
    var func = this.functions[funcName];

    if (!func) {
      this.logger.info('Host: request for unknown function "' + funcName + '"');
      return res.status(404).end('Not found. Unknown function "' + funcName + '"');
    }

    res.locals.func = func;

    next();
  }.bind(this));

  app.post('/function/:function', function callFunction(req, res) {
    var func = res.locals.func;

    this.logger.info('Host: calling function ' + func.name);

    var data = req.body;

    var context = {
      name: func.name,
      host: this,
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

      this.logger.error('Host: function ' + func.name + ' produced an error', err.stack);

      return res.status(500).end(err.stack);
    }

    this.logger.info('Host: function ' + func.name + ' completed');

    res.end(output.toString());
  }.bind(this);
};

module.exports = Host;