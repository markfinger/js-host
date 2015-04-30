'use strict';

var _ = require('lodash');

var Func = function Func(name, handler) {
  this.name = name;
  this.handler = handler;

  if (!_.isString(this.name) || !this.name.length) {
    throw new Error('"' + this.name + '" is not a valid function name');
  }

  if (!_.isFunction(this.handler)) {
    throw new Error('Function handlers must be functions');
  }
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
      output = output.toString();
    }

    cb(null, output);
  };
};

Func.prototype.call = function call(context, data, cb) {
  return this.handler.call(context, data, this.processResponse(cb));
};

module.exports = Func;