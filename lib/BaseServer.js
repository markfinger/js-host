'use strict';

var http = require('http');
var express = require('express');
var _ = require('lodash');
var bodyParser = require('body-parser');
var logger = require('./logger');
var version = require('../package').version;

var BaseServer = function BaseServer(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);

  this.app = express();
  this.bindApp(this.app);
  this.server = http.Server(this.app);

  if (this.config.logger) {
    this.logger = this.config.logger;
  } else if (this.config.silent) {
    this.logger = logger.createSilent();
  } else {
    this.logger = logger.create();
  }
};

BaseServer.prototype.defaultConfig = {
  address: '127.0.0.1',
  port: '9009',
  logger: null,
  silent: false,
  outputOnListen: true,
  requestDataLimit: '10mb'
};

BaseServer.prototype.constructor = BaseServer;

BaseServer.prototype.getSerializableConfig = function getSerializableConfig() {
  var serializableConfig = _.omit(this.config, [
    'logger',
    'silent',
    'outputOnListen',
    'disconnectTimeout',
    'stopManagerIfNoConnections'
  ]);

  // Convert `functions` to an array of names
  return _.mapValues(serializableConfig, function(val, key) {
    if (key === 'functions' && val) {
      return Object.keys(val);
    }
    return val;
  });
};

BaseServer.prototype.getStatus = function getStatus() {
  return {
    type: this.constructor.name,
    version: version,
    config: this.getSerializableConfig()
  }
};

BaseServer.prototype.bindApp = function bindApp(app) {
  app.use(function requestLog(req, res, next) {
    this.logger.info(this.constructor.name + ': ' + req.method + ' ' + req.url);
    next();
  }.bind(this));

  app.get('/status', function status(req, res) {
    res.json(this.getStatus());
  }.bind(this));

  app.use(bodyParser.json({
    limit: this.config.requestDataLimit
  }));

  return app;
};

BaseServer.prototype.onListenOutput = function onListenOutput() {
  return this.constructor.name + ' listening at ' + this.getAddress() + '\n';
};

BaseServer.prototype.listen = function(cb) {
  this.server.listen(
    this.config.port,
    this.config.address,
    function() {
      // If an open/random port was chosen, update the config
      if (this.config.port.toString() === '0') {
        this.config.port = this.server.address().port;
      }

      if (this.config.outputOnListen) {
        process.stdout.write(this.onListenOutput());
      }

      if (cb) {
        cb(this);
      }
    }.bind(this)
  );
};

BaseServer.prototype.stopListening = function stopListening() {
  if (this.server) {
    this.logger.info('Stopping...');
    this.server.close();
  }
};

BaseServer.prototype.getAddress = function getAddress() {
  return this.config.address + ':' + this.config.port;
};

BaseServer.prototype.getUrl = function getUrl() {
  return 'http://' + this.getAddress();
};

module.exports = BaseServer;