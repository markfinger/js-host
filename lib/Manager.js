'use strict';

var path = require('path');
var child_process = require('child_process');
var _ = require('lodash');
var Host = require('./Host');

var Manager = function Manager(config) {
  Host.call(this, config);

  this.hosts = Object.create(null);
};

Manager.prototype = Object.create(Host.prototype);

Manager.prototype.bindListener = function bindListener(listener) {
  listener.use(this.getRequestLogMiddleware());

  listener.get('/start', function(req, res) {
    var config = req.query.config;
    if (!config) {
      return res.status(500).end('No `config` param defined');
    }

    this.getHost(config, function(err, host) {
      if (err) {
        this.error('Error starting child host', err.stack);
        return res.status(500).end(err.stack);
      }
      res.end(host.output);
    });
  }.bind(this));

  // TODO: /stop endpoint, takes `timeout` param

  return listener;
};

Manager.prototype.getHost = function getHost(config, cb) {
  var host = this.hosts[config];

  if (host) {
    return cb(null, host);
  }

  this.startHost(config, function(err, host) {
    if (err) return cb(err);

    this.hosts[config] = host;

    cb(null, host);
  }.bind(this));
};

Manager.prototype.startHost = function startHost(config, cb) {
  this.log('Starting child host with config: ' + config);

  var hostProcess = child_process.spawn(
    _.first(process.argv),
    [
      path.join(__dirname, '..', 'bin', 'service-host.js'),
      // Point the host at the config file
      config,
      // Start the host on an open port
      '--port', '0',
      // Ensure that the host's config is outputted on startup
      '--json'
    ]
  );

  var host = {
    output: null,
    config: config,
    process: hostProcess
  };

  var startupOutputReceived = false;

  hostProcess.stdout.on('data', function(data) {
    if (!startupOutputReceived) {
      startupOutputReceived = true;

      var output = data.toString();

      try {
        var json = JSON.parse(output);
      } catch(err) {
        this.removeHost(config);
        cb(err);
      }

      // Sanity check
      if (json.address !== this.config.address) {
        this.removeHost(config);
        cb(new Error('Unexpected output from child process: ' + output));
      }

      host.output = output;

      return cb(null, host);
    }
    // TODO: stream stdout somewhere
  }.bind(this));

  hostProcess.stderr.on('data', function(data) {
    if (!startupOutputReceived) {
      startupOutputReceived = true;
      return cb(new Error('Error starting child host: ' + data.toString()));
    }
    // TODO: stream stderr somewhere
  });

  hostProcess.on('exit', function() {
    this.removeHost(config);

    if (!startupOutputReceived) {
      startupOutputReceived = true;
      return cb(new Error('Child host exited without output'));
    }
  }.bind(this));
};

Manager.prototype.stopHost = function stopHost(config, cb) {
  var host = this.hosts[config];

  if (!host) {
    return cb(new Error('No known host with config: ' + config));
  }

  this.removeHost(config);

  host.process.kill();

  this.log('Stopped child host with config: ' + config);
  cb(null, host);
};

Manager.prototype.removeHost = function removeHost(config) {
  delete this.hosts[config];
  this.log('Removed record of child host with config: ' + config);
};

Manager.prototype.onListenOutput = function onListenOutput() {
  return 'Manager listening at ' + this.getAddress() + '\n';
};

module.exports = Manager;