'use strict';

var express = require('express');
var winston = require('winston');
var _ = require('lodash');
var packageJson = require('../package.json');

var BaseServer = function BaseServer(config) {
  this.config = _.defaults(config || {}, this.defaultConfig);

  this.listenerServer = null;
  this.listener = this.createListener();
  this.bindListener(this.listener);

  if (this.config.logger) {
    this.logger = this.config.logger;
  } else {
    this.logger = this.createLogger();
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
  return _.mapValues(this.config, function(val, key) {
    return key === 'logger' ? undefined : val;
  });
};

BaseServer.prototype.getStatus = function getStatus() {
  return {
    type: this.constructor.name,
    version: packageJson.version,
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

BaseServer.prototype.createLogger = function createLogger() {
  if (this.config.silent) {
    return new winston.Logger({
      exitOnError: false,
      transports: []
    });
  }

  return new winston.Logger({
    exitOnError: true,
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        silent: this.config.silent,
        colorize: true,
        timestamp: true,
        prettyPrint: true,
        showLevel: true
      })
    ]
  });
};

module.exports = BaseServer;