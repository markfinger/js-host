'use strict';

var path = require('path');
var child_process = require('child_process');
var _ = require('lodash');
var BaseServer = require('./BaseServer');

var Manager = function Manager(config) {
  BaseServer.call(this, config);

  this.hosts = Object.create(null);
};

Manager.prototype = Object.create(BaseServer.prototype);

Manager.prototype.constructor = Manager;

Manager.prototype.bindListener = function bindListener(listener) {
  BaseServer.prototype.bindListener.call(this, listener);

  listener.post('/manager/stop', function(req, res) {
    res.end('Stopping...');

    this.stop();
  }.bind(this));

  listener.post('/host/start', function(req, res) {
    var config = req.query.config;

    if (!config) {
      return res.status(500).end('No `config` param provided');
    }

    this.getHost(config, function(err, host, started) {
      if (err) {
        this.logger.error('Error starting child host', err.stack);
        return res.status(500).end(err.stack);
      }

      res.json({
        started: started,
        output: host.output
      });
    });
  }.bind(this));

  listener.post('/host/stop', function(req, res) {
    var config = req.query.config;

    if (!config) {
      return res.status(500).end('No `config` param defined');
    }

    var host = this.hosts[config];

    if (!host) {
      return res.status(500).end('No known host with config: ' + config);
    }

    var timeout = parseInt(req.query.timeout);

    var stopManagerIfLastHost = 'stop-manager-if-last-host' in req.query;

    this.stopHost(config, timeout, function(err, host) {
      if (err) {
        this.logger.error('Error stopping child host', err.stack);
      }

      if (stopManagerIfLastHost) {
        process.nextTick(function() {
          if (Object.keys(this.hosts).length === 0) {
            this.stop();
          }
        }.bind(this));
      }
    }.bind(this));

    res.end(host.output);
  }.bind(this));

  return listener;
};

Manager.prototype.getHost = function getHost(config, cb) {
  var host = this.hosts[config];

  if (host) {
    if (host.stopTimeout) {
      clearTimeout(host.stopTimeout);
      host.stopTimeout = null;
    }
    return cb(null, host, false);
  }

  this.startHost(config, function(err, host) {
    if (err) return cb(err);

    this.hosts[config] = host;

    cb(null, host, true);
  }.bind(this));
};

Manager.prototype.startHost = function startHost(config, cb) {
  this.logger.log('Starting child host with config: ' + config);

  var hostProcess = child_process.spawn(
    // Reuse the path to node that this process was started with
    _.first(process.argv),
    [
      path.join(__dirname, '..', 'bin', 'js-host.js'),
      // Point the host at the config file
      config,
      // Start the host on an open/random port
      '--port', '0',
      // Output the host's config as JSON
      '--json'
    ]
  );

  var host = {
    output: null,
    config: config,
    process: hostProcess,
    stopTimeout: null
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

      // Sanity checks
      var status = this.getStatus();
      if (
        json.version !== status.version ||
        json.config.address !== status.config.address
      ) {
        this.removeHost(config);
        cb(new Error('Unexpected output from child process: ' + output));
      }

      host.output = output;

      return cb(null, host);
    }
    // TODO: stream stdout somewhere?
  }.bind(this));

  hostProcess.stderr.on('data', function(data) {
    if (!startupOutputReceived) {
      startupOutputReceived = true;
      return cb(new Error('Error starting child host: ' + data.toString()));
    }
    // TODO: stream stderr somewhere?
  });

  hostProcess.on('exit', function() {
    this.removeHost(config);

    if (!startupOutputReceived) {
      startupOutputReceived = true;
      return cb(new Error('Child host exited without output'));
    }
  }.bind(this));
};

Manager.prototype.stopHost = function stopHost(config, timeout, cb) {
  var host = this.hosts[config];

  if (!host) {
    return cb(new Error('No known host with config: ' + config));
  }

  host.stopTimeout = setTimeout(function() {
    host.stopTimeout = null;

    this.removeHost(config);

    host.process.kill();

    this.logger.log('Stopped child host with config: ' + config);

    cb(null, host);
  }.bind(this), timeout);
};

Manager.prototype.removeHost = function removeHost(config) {
  delete this.hosts[config];
  this.logger.log('Removed record of child host with config: ' + config);
};

Manager.prototype.stop = function stop() {
  var hosts = _.values(this.hosts);

  if (hosts.length) {
    this.logger.info('Stopping ' + hosts.length + ' host(s)...\n');
    hosts.forEach(function(host) {
      host.process.kill();
    });
  }

  this.logger.info('Stopping process... ');

  process.exit();
};

module.exports = Manager;