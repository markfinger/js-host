'use strict';

var express = require('express');
var _ = require('lodash');
var bodyParser = require('body-parser');
var logger = require('./logger');
var version = require('../package').version;

var BaseServer = function BaseServer(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);

  this.listenerServer = null;
  this.listener = this.createListener();
  this.bindListener(this.listener);

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
  outputOnListen: true
};

BaseServer.prototype.constructor = BaseServer;

BaseServer.prototype.createListener = function createListener() {
  return express();
};

BaseServer.prototype.getSerializableConfig = function getSerializableConfig() {
  return _.omit(this.config, ['logger', 'silent', 'outputOnListen']);
};

BaseServer.prototype.getStatus = function getStatus() {
  return {
    type: this.constructor.name,
    version: version,
    config: this.getSerializableConfig()
  }
};

BaseServer.prototype.bindListener = function bindListener(listener) {
  listener.use(function requestLog(req, res, next) {
    this.logger.info(req.method + ' ' + req.url);
    next();
  }.bind(this));

  listener.get('/status', function status(req, res) {
    res.json(this.getStatus());
  }.bind(this));

  listener.use(bodyParser.json({
    limit: this.config.requestDataLimit
  }));

  return listener;
};

BaseServer.prototype.onListenOutput = function onListenOutput() {
  return this.constructor.name + ' listening at ' + this.getAddress() + '\n';
};

BaseServer.prototype.listen = function(cb) {
  this.listenerServer = this.listener.listen(
    this.config.port,
    this.config.address,
    function() {
      // If an open/random port was chosen, update the config
      if (this.config.port.toString() === '0') {
        this.config.port = this.listenerServer.address().port;
      }

      if (this.config.outputOnListen) {
        process.stdout.write(this.onListenOutput());
      }

      if (cb) cb(this);
    }.bind(this)
  );
};

BaseServer.prototype.stopListening = function stopListening() {
  if (this.listenerServer) {
    this.logger.info('Stopping listener');
    this.listenerServer.close();
    this.listenerServer = null;
  }
};

BaseServer.prototype.getAddress = function getAddress() {
  return this.config.address + ':' + this.config.port;
};

BaseServer.prototype.getUrl = function getUrl() {
  return 'http://' + this.getAddress();
};

module.exports = BaseServer;