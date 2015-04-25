'use strict';

var _ = require('lodash');
var Cache = require('./Cache');

var Func = function Func(opts) {
  opts = opts || {};

  this.name = opts.name;
  this.handler = opts.handler;
  this.cacheTimeout = opts.cacheTimeout;
  this.host = opts.host;

  this.cache = this.getCache();
  this.pending = Object.create(null);

  this.validate();
};

Func.prototype.getCache = function getCache() {
  return new Cache();
};

Func.prototype.validate = function validate() {
  if (!_.isString(this.name) || !this.name.length) {
    throw new Error('"' + this.name + '" is not a valid function name');
  }

  if (!_.isFunction(this.handler)) {
    throw new Error('Function handlers must be functions');
  }

  if (!_.isNull(this.cacheTimeout) && !_.isNumber(this.cacheTimeout)) {
    throw new Error('Function cache timeouts must be either null or a number');
  }
};

Func.prototype.getCachedOutput = function getCachedOutput(key) {
  return this.cache.get(key);
};

Func.prototype.callPending = function callPending(key, err, output) {
  var pending = this.pending[key];
  this.pending[key] = [];

  pending.forEach(function(cb) {
    cb(err, output);
  });
};

Func.prototype.getHandlerContext = function getHandlerContext() {
  return {
    name: this.name,
    host: this.host
  };
};

Func.prototype.processResponse = function processResponse(cb) {
  return function(err, output) {
    if (err) return cb(err);

    if (!output) {
      return cb(new Error('Function failed to provide valid output. Provided: "' + output + '"'));
    }

    if (_.isObject(output)) {
      try {
        output = JSON.stringify(output);
      } catch(err) {
        return cb(err);
      }
    }

    if (typeof output !== 'string') {
      output = output.toString()
    }

    cb(null, output);
  };
};

Func.prototype.call = function call(data, key, cb) {
  // Allow `key` to be an optional argument
  if (cb === undefined && _.isFunction(key)) {
    cb = key;
    key = null;
  }

  if (!key) {
    return this.handler.call(
      this.getHandlerContext(),
      data,
      this.processResponse(cb)
    );
  }

  var cachedOutput = this.getCachedOutput(key);

  if (cachedOutput) {
    return cb(null, cachedOutput);
  }

  var pending = this.pending[key] = this.pending[key] || [];

  pending.push(cb);

  if (pending.length === 1) {
    this.handler.call(
      this.getHandlerContext(),
      data,
      this.processResponse(function(err, output) {
        if (!err) {
          this.cache.set(key, output, this.cacheTimeout);
        }
        this.callPending(key, err, output);
      }.bind(this))
    );
  }
};

module.exports = Func;