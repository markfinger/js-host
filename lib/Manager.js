'use strict';

var path = require('path');
var child_process = require('child_process');
var _ = require('lodash');
var tmp = require('tmp');
var uuid = require('uuid');
var BaseServer = require('./BaseServer');

var Manager = function Manager(config) {
  BaseServer.call(this, config);

  this.hosts = Object.create(null);
};

Manager.prototype = Object.create(BaseServer.prototype);

Manager.prototype.constructor = Manager;

Manager.prototype.defaultConfig = _.defaults({
  disconnectTimeout: 5 * 1000, // 5 seconds
  stopManagerIfNoConnections: true
}, BaseServer.prototype.defaultConfig);

Manager.prototype.getSerializableConfig = function getSerializableConfig() {
  var serializableConfig = BaseServer.prototype.getSerializableConfig.call(this);

  return _.omit(serializableConfig, 'disconnectTimeout', 'stopManagerIfNoConnections');
};

Manager.prototype.getConnectionIdentifier = function getConnectionIdentifier() {
  return +new Date() + '-' + uuid.v4();
};

Manager.prototype.serializeHost = function serializeHost(config) {
  return _.pick(this.hosts[config], ['output', 'logfile', 'config', 'connections']);
};

Manager.prototype.bindListener = function bindListener(listener) {
  BaseServer.prototype.bindListener.call(this, listener);

  listener.post('/manager/stop', function(req, res) {
    res.end('Stopping...');

    var hosts = _.values(this.hosts);

    if (hosts.length) {
      this.logger.info('Stopping ' + hosts.length + ' host(s)...\n');
      hosts.forEach(function(host) {
        host.process.kill();
      });
    }

    this.logger.info('Stopping process...');

    process.exit();
  }.bind(this));

  // Ensure requests provide a config
  listener.use(function(req, res, next) {
    if (!req.body.config) {
      return res.status(500).end('No `config` data provided');
    }
    next();
  });

  listener.post('/host/start', function(req, res) {
    var config = req.body.config;

    if (this.hosts[config]) {
      return res.status(500).end('Host already running');
    }

    this.startHost({config: config, port: 0}, function(err, host) {
      if (err) {
        this.logger.error('Error starting host', err.stack);
        return res.status(500).end(err.stack);
      }

      this.hosts[config] = host;

      res.json(this.serializeHost(config));
    }.bind(this));
  }.bind(this));

  listener.post('/host/stop', function(req, res) {
    var config = req.body.config;

    var host = this.hosts[config];

    if (!host) {
      return res.status(500).end('No known host with config: ' + config);
    }

    var obj = this.serializeHost(config);

    this.removeHost(config);

    host.process.kill();

    this.logger.info('Stopped child host with config: ' + config);

    res.json(obj);
  }.bind(this));

  listener.post('/host/restart', function(req, res) {
    var config = req.body.config;

    var host = this.hosts[config];

    if (!host) {
      return res.status(500).end('No known host with config: ' + config);
    }

    host.process.removeAllListeners('exit');

    host.process.kill();

    var status = JSON.parse(host.output);
    var currentPort = status.config.port;

    this.startHost({
      config: config,
      port: currentPort,
      logfile: host.logfile,
      connections: host.connections
    }, function(err, host) {
      if (err) {
        this.logger.error('Error starting host', err.stack);
        return res.status(500).end(err.stack);
      }

      this.hosts[config] = host;

      res.json(this.serializeHost(config));
    }.bind(this));
  }.bind(this));

  listener.post('/host/status', function(req, res) {
    var config = req.body.config;

    var host = this.hosts[config];

    if (!host) {
      return res.json({started: false});
    }

    res.json({
      started: true,
      host: this.serializeHost(config)
    });
  }.bind(this));

  listener.post('/host/connect', function(req, res) {
    var config = req.body.config;

    var host = this.hosts[config];

    if (!host) {
      return res.status(500).end('No known host with config: ' + config);
    }

    if (host.stopTimeout) {
      clearTimeout(host.stopTimeout);
      host.stopTimeout = null;
      this.logger.info('The host with config ' + config + ' has had its stop timeout cancelled');
    }

    var obj = this.serializeHost(config);
    obj.connection = this.getConnectionIdentifier();
    host.connections.push(obj.connection);

    this.logger.info('Connection ' + obj.connection + ' opened to host with config ' + config);

    res.json(obj);
  }.bind(this));

  listener.post('/host/disconnect', function(req, res) {
    var config = req.body.config;

    var connection = req.body.connection;

    if (!connection) {
      return res.status(500).end('No `connection` data provided');
    }

    var host = this.hosts[config];

    var output = {
      started: !!host,
      config: config,
      stopTimeout: null
    };

    if (host) {
      this.logger.info('Connection ' + connection + ' closed to host with config ' + config);
    }

    if (!host) {
      output.status = 'Host has already stopped';
    } else if (_.contains(host.connections, connection)) {
      host.connections = _.without(host.connections, connection);

      if (!host.connections.length) {
        host.stopTimeout = setTimeout(function() {
          this.removeHost(config);

          host.process.kill();

          this.logger.info('Stopped child host with config: ' + config);

          this.exitIfNoConnections();
        }.bind(this), this.config.disconnectTimeout);

        this.logger.info(
          'The host with config ' + config + ' no longer has any connections. ' +
          'Stopping host in ' + this.config.disconnectTimeout + 'ms'
        );

        output.stopTimeout = this.config.disconnectTimeout;
        output.status = 'Disconnected. Stopping host in ' + this.config.disconnectTimeout + 'ms'
      }
    }

    if (!output.status) {
      output.status = 'Disconnected';
    }

    res.json(output);
  }.bind(this));

  return listener;
};

Manager.prototype.startHost = function startHost(obj, cb) {
  var config = obj.config;
  var port = obj.port;
  var logfile = obj.logfile || tmp.tmpNameSync();
  var connections = obj.connections || [];

  this.logger.info('Starting child host with config: ' + config);

  var child = child_process.spawn(
    // Reuse the path to node that this process was started with
    _.first(process.argv),
    [
      path.join(__dirname, '..', 'bin', 'js-host.js'),
      // Point the host at the config file
      config,
      // Start the host on the selected port
      '--port', '' + port,
      // Output the host's config as JSON
      '--json',
      // Send the host's output to a file
      '--logfile', logfile
    ]
  );

  var outputReceived = false;

  child.stdout.once('data', function(data) {
    if (!outputReceived) {
      outputReceived = true;

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

      return cb(null, {
        output: output,
        config: config,
        process: child,
        stopTimeout: null,
        logfile: logfile,
        connections: connections,
        port: port
      });
    }
  }.bind(this));

  child.stderr.once('data', function(data) {
    if (!outputReceived) {
      outputReceived = true;
      return cb(new Error('Error starting child host: ' + data.toString()));
    }
  });

  child.once('exit', function() {
    this.removeHost(config);

    if (!outputReceived) {
      outputReceived = true;
      return cb(new Error('Child host exited without output'));
    }
  }.bind(this));
};

Manager.prototype.removeHost = function removeHost(config) {
  delete this.hosts[config];
  this.logger.info('Removed record of host with config: ' + config);
};

Manager.prototype.exitIfNoConnections = function exitIfNoConnections() {
  if (this.config.stopManagerIfNoConnections) {
    process.nextTick(function() {
      if (!_.keys(this.hosts).length) {
        this.logger.info('All hosts have stopped. Shutting down manager');
        process.exit();
      }
    }.bind(this));
  }
};

module.exports = Manager;