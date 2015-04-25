'use strict';

var _ = require('lodash');
var Cache = require('./Cache');

var Service = function Service(opts) {
  opts = opts || {};

  this.name = opts.name;
  this.handler = opts.handler;
  this.cacheTimeout = opts.cacheTimeout;
  this.host = opts.host;

  this.cache = this.getCache();
  this.pending = Object.create(null);

  this.validate();
};

Service.prototype.getCache = function getCache() {
  return new Cache();
};

Service.prototype.validate = function validate() {
  if (!_.isString(this.name) || !this.name.length) {
    throw new Error('"' + this.name + '" is not a valid service name');
  }
  if (!_.isFunction(this.handler)) {
    throw new Error('Service handlers must be a function');
  }
  if (!_.isNull(this.cacheTimeout) && !_.isNumber(this.cacheTimeout)) {
    throw new Error('Service cache timeouts must be either null or a number');
  }
};

Service.prototype.getCachedOutput = function getCachedOutput(cacheKey) {
  return this.cache.get(cacheKey);
};

Service.prototype.callPending = function callPending(cacheKey, err, output) {
  var pending = this.pending[cacheKey];
  this.pending[cacheKey] = [];

  pending.forEach(function(cb) {
    cb(err, output);
  });
};

Service.prototype.getHandlerContext = function getHandlerContext() {
  return {
    name: this.name,
    host: this.host
  };
};

Service.prototype.processResponse = function processResponse(cb) {
  return function(err, output) {
    if (err) return cb(err);

    if (!output) {
      return cb(new Error('Service failed to return valid output - ' + output));
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

Service.prototype.call = function call(data, cacheKey, cb) {
  // Allow `cacheKey` to be an optional argument
  if (cb === undefined && _.isFunction(cacheKey)) {
    cb = cacheKey;
    cacheKey = null;
  }

  if (!cacheKey) {
    return this.handler.call(
      this.getHandlerContext(),
      data,
      this.processResponse(cb)
    );
  }

  var cachedOutput = this.getCachedOutput(cacheKey);
  if (cachedOutput) {
    return cb(null, cachedOutput);
  }

  var pending = this.pending[cacheKey] = this.pending[cacheKey] || [];
  pending.push(cb);

  if (pending.length === 1) {
    this.handler.call(
      this.getHandlerContext(),
      data,
      this.processResponse(function(err, output) {
        if (!err) {
          this.cache.set(cacheKey, output, this.cacheTimeout);
        }
        this.callPending(cacheKey, err, output);
      }.bind(this))
    );
  }
};

module.exports = Service;