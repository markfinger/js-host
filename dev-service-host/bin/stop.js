var child_process = require('child_process');
var fs = require('fs');
var _ = require('lodash');
var request = require('request');
var utils = require('../../bin/utils');
var DevHost = require('../lib/DevHost');
var __shutdown = require('../lib/services/__shutdown');

var config = utils.configArg();
var host = new DevHost(config);

request.post({url: host.getUrl(), headers: {'X-Service': '__shutdown'}}, function(err, res, body) {
  if (err) {
    if (_.contains(err.message, 'ECONNREFUSED')) {
      return console.log('Cannot find a host at ' + host.getAddress() + ' to stop');
    }
    throw err;
  }
  // Wait until the process has shutdown
  setTimeout(function() {
    request.post({url: host.getUrl(), headers: {'X-Service': '__status'}}, function(err, res, body) {
      if (_.contains(err.message, 'ECONNREFUSED')) {
        return console.log('Stopped the host at ' + host.getAddress());
      }
      var status;
      try {
        status = JSON.parse(body);
      } catch(err) {}
      if (status && status.isListening) {
        throw new Error(
          'Attempted to stop the host at ' + host.getAddress() + ', but a host is still responding at that address'
        );
      }
      if (err) {
        throw err;
      }
      throw new Error('Unexpected response: ' + body);
    });
  }, 100);
});