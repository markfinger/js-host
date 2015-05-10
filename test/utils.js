'use strict';

var chai = require('chai');
var request = require('request');
var _ = require('lodash');

chai.config.includeStack = true;

module.exports = {
  assert: chai.assert,
  postToHost: function(host, funcName, opts, cb) {
    opts = opts || {};
    if (_.isFunction(opts)) {
      cb = opts;
      opts = {};
    }
    var url = host.getUrl() + '/function/' + funcName;
    if (opts.key) {
      url += '?key=' + encodeURIComponent(opts.key);
    }
    request.post({
      url: url,
      json: true,
      body: opts.data
    }, cb);
  },
  postToManager: function(manager, endpoint, data, cb) {
    if (_.isFunction(data)) {
      cb = data;
      data = {};
    }
    request.post({url: manager.getUrl() + endpoint, body: data, json: true}, cb);
  }
};
