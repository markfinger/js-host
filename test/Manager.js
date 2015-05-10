'use strict';

var path = require('path');
var assert = require('./utils').assert;
var _ = require('lodash');
var request = require('request');
var Manager = require('../lib/Manager');
var Host = require('../lib/Host');
var utils = require('./utils');
var version = require('../package').version;

var pathToTestConfig = path.join(__dirname, 'test_config', 'config.js');
var pathToDuplicateConfig = path.join(__dirname, 'test_config', 'duplicate.js');

var postToManagedHost = function(host, funcName, data, cb) {
  var config = host.output ? JSON.parse(host.output).config : host;
  // Get around validation issues caused by (de)serialization issues
  config.functions = null;
  // Prevent the logger from adding handlers to the process's emitter
  config.silent = true;
  utils.postToHost(new Host(config), funcName, data, cb);
};

var postToManager = utils.postToManager;


describe('Manager', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Manager);
    });
    it('should instantiate with properties set correctly', function() {
      var manager = new Manager({silent: true});
      assert.isObject(manager.config);
      assert.notStrictEqual(manager.config, manager.defaultConfig);
      assert.deepEqual(
        _.omit(manager.config, 'silent'),
        _.omit(manager.defaultConfig, 'silent')
      );
      assert.isObject(manager.hosts);
      assert.deepEqual(manager.hosts, Object.create(null));
    });
    it('the constructor should accept a config', function() {
      var config = {silent: true};
      var manager = new Manager(config);
      assert.notStrictEqual(manager.config, manager.defaultConfig);
      assert.strictEqual(manager.config, config);
      assert.deepEqual(
        _.omit(manager.config, 'silent'),
        _.omit(manager.defaultConfig, 'silent')
      );
    });
  });
  describe('/status endpoint', function() {
    it('can expose a manager\'s status as JSON', function(done) {
      var manager = new Manager({
        outputOnListen: false,
        silent: true
      });
      manager.listen(function() {
        request(manager.getUrl() + '/status', function(err, res, body) {
          assert.isNull(err);

          var status = JSON.parse(body);
          assert.equal(status.type, 'Manager');
          var config = status.config;
          assert.isDefined(status.version);
          assert.equal(status.version, version);
          assert.isUndefined(status.logger);
          assert.isObject(config);
          assert.equal(config.address, manager.config.address);
          assert.equal(config.port, manager.config.port);

          manager.stopListening();
          done();
        });
      });
    });
  });
  describe('#startHost()', function() {
    it('should accept a path to a config file and start a host on a selected port', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.startHost({config: pathToTestConfig, port: 9009}, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isString(host.logfile);
        var json = JSON.parse(host.output);
        assert.equal(json.config.port, 9009);
        assert.notEqual(config.port, json.config.port);
        postToManagedHost(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          host.process.kill();
          done();
        });
      });
    });
    it('can start a host on a random port', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.startHost({config: pathToTestConfig, port: 0}, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isString(host.logfile);
        var json = JSON.parse(host.output);
        assert.notEqual(json.config.port, config.port);
        postToManagedHost(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          host.process.kill();
          done();
        });
      });
    });
    it('can run multiple hosts at once', function(done) {
      this.timeout(5000);

      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      var duplicateConfig = require(pathToDuplicateConfig);
      manager.startHost({config: pathToTestConfig, port: 0}, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        manager.startHost({config: pathToDuplicateConfig, port: 0}, function(err, _host) {
          assert.isNull(err);
          assert.isObject(_host);
          var json = JSON.parse(_host.output);
          assert.notEqual(json.port, duplicateConfig.port);
          assert.notStrictEqual(_host, host);
          postToManagedHost(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'foo');
            postToManagedHost(host, 'echo', {data: {echo: 'bar'}}, function(err, res, body) {
              assert.isNull(err);
              assert.equal(body, 'bar');
              postToManagedHost(_host, 'echo', {data: {echo: 'woz'}}, function(err, res, body) {
                assert.isNull(err);
                assert.equal(body, 'woz');
                host.process.kill();
                _host.process.kill();
                done();
              });
            });
          });
        });
      });
    });
  });
  describe('/host/start endpoint', function() {
    it('should be able to start a host and block until it is ready', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      var testConfig = require(pathToTestConfig);
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(res.statusCode, 200);
          assert.isString(body.logfile);
          assert.equal(body.config, pathToTestConfig);
          assert.deepEqual(manager.serializeHost(pathToTestConfig), body);
          var config = JSON.parse(body.output).config;
          assert.notEqual(config.port, testConfig.port);
          postToManagedHost({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'test');
            assert.isObject(manager.hosts[pathToTestConfig]);
            manager.hosts[pathToTestConfig].process.kill();
            manager.stopListening();
            done();
          });
        });
      });
    });
    it('if a host exits, the manager should remove its record of it', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        assert.isUndefined(manager.hosts[pathToTestConfig]);
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          var host = manager.hosts[pathToTestConfig];
          assert.isObject(host);
          host.process.kill();
          setTimeout(function() {
            assert.isUndefined(manager.hosts[pathToTestConfig]);
            manager.stopListening();
            done();
          }, 400);
        });
      });
    });
  });
  describe('/host/stop endpoint', function() {
    it('should accept a path to a config file, and stop the host', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.isObject(body);
          var config = JSON.parse(body.output).config;
          postToManagedHost({port: config.port}, 'echo', {data: {echo: 'foo'}}, function(err, res, _body) {
            assert.isNull(err);
            assert.equal(_body, 'foo');
            postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, __body) {
              assert.isNull(err);
              assert.equal(__body.output, body.output);
              assert.equal(__body.logfile, body.logfile);
              assert.isUndefined(manager.hosts[pathToTestConfig]);
              postToManagedHost({port: config.port}, 'echo', {data: {echo: 'foo'}}, function(err, res, ___body) {
                assert.instanceOf(err, Error);
                manager.stopListening();
                done();
              });
            });
          });
        });
      });
    });
    it('should return errors, if the host is not running', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.equal(body, 'No known host with config: ' + pathToTestConfig);
          manager.stopListening();
          done();
        });
      });
    });
  });
  describe('/host/restart endpoint', function() {
    it('should accept a path to a config file, and restart the host', function(done) {
      this.timeout(5000);

      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.isObject(body);
          var config = JSON.parse(body.output).config;
          postToManagedHost({port: config.port}, 'counter', function(err, res, _body) {
            assert.isNull(err);
            assert.equal(_body, '1');
            postToManagedHost({port: config.port}, 'counter', function(err, res, _body) {
              assert.isNull(err);
              assert.equal(_body, '2');
              postToManager(manager, '/host/restart', {config: pathToTestConfig}, function(err, res, __body) {
                assert.isNull(err);
                assert.equal(__body.output, body.output);
                assert.equal(__body.logfile, body.logfile);
                postToManagedHost({port: config.port}, 'counter', function(err, res, _body) {
                  assert.isNull(err);
                  assert.equal(_body, '1');
                  postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, __body) {
                    assert.isNull(err);
                    assert.equal(__body.output, body.output);
                    assert.equal(__body.logfile, body.logfile);
                    assert.isUndefined(manager.hosts[pathToTestConfig]);
                    manager.stopListening();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
    it('should return errors, if the host is not running', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/restart', {config: pathToTestConfig}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.equal(body, 'No known host with config: ' + pathToTestConfig);
          manager.stopListening();
          done();
        });
      });
    });
    it('should preserve a host\'s connection list', function(done) {
      this.timeout(5000);

      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.isObject(body);
          assert.isArray(body.connections);
          assert.equal(body.connections.length, 0);
          postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
            assert.isNull(err);
            var connection1 = body.connection;
            assert.isString(connection1);
            postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
              assert.isNull(err);
              var connection2 = body.connection;
              assert.isString(connection2);
              postToManager(manager, '/host/restart', {config: pathToTestConfig}, function(err, res, body) {
                assert.isArray(body.connections);
                assert.equal(body.connections.length, 2);
                assert.equal(body.connections[0], connection1);
                assert.equal(body.connections[1], connection2);
                postToManager(manager, '/host/restart', {config: pathToTestConfig}, function (err, res, body) {
                  assert.isArray(body.connections);
                  assert.equal(body.connections.length, 2);
                  assert.equal(body.connections[0], connection1);
                  assert.equal(body.connections[1], connection2);
                  manager.hosts[pathToTestConfig].process.kill();
                  manager.stopListening();
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
  describe('/host/connect endpoint', function() {
    it('should accept a path to a config file, and provide a unique connection identifier', function(done) {
      this.timeout(5000);

      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.isArray(manager.hosts[pathToTestConfig].connections);
          assert.equal(manager.hosts[pathToTestConfig].connections.length, 0);
          postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
            assert.isNull(err);
            assert.isObject(body);
            var id1 = body.connection;
            assert.notEqual(id1.length, 0);
            assert.isString(id1);
            assert.equal(manager.hosts[pathToTestConfig].connections.length, 1);
            assert.equal(manager.hosts[pathToTestConfig].connections[0], id1);
            postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
              assert.isNull(err);
              assert.isObject(body);
              var id2 = body.connection;
              assert.isString(id2);
              assert.notEqual(id2, id1);
              assert.equal(manager.hosts[pathToTestConfig].connections.length, 2);
              assert.equal(manager.hosts[pathToTestConfig].connections[1], id2);
              postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, body) {
                assert.isNull(err);
                manager.stopListening();
                done();
              });
            });
          });
        });
      });
    });
    it('should return errors, if the host is not running', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.equal(body, 'No known host with config: ' + pathToTestConfig);
          manager.stopListening();
          done();
        });
      });
    });
  });
  describe('/host/disconnect endpoint', function() {
    it('should remove a connection identifier from a host\'s connections', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig, port: 0}, function(err, res, body) {
          assert.isNull(err);
          var host = manager.hosts[pathToTestConfig];
          assert.equal(host.connections.length, 0);
          host.connections.push('test1');
          host.connections.push('test2');
          host.connections.push('test3');
          postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: 'test1'}, function(err, res, body) {
            assert.isNull(err);

            assert.isObject(body);
            assert.equal(body.config, pathToTestConfig);
            assert.isTrue(body.started);
            assert.equal(body.status, 'Disconnected');
            assert.isNull(body.stopTimeout);

            assert.equal(host.connections.length, 2);
            assert.include(host.connections, 'test2');
            assert.include(host.connections, 'test3');
            postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: 'test2'}, function(err, res, body) {
              assert.isNull(err);

              assert.isObject(body);
              assert.equal(body.config, pathToTestConfig);
              assert.isTrue(body.started);
              assert.equal(body.status, 'Disconnected');
              assert.isNull(body.stopTimeout);

              assert.equal(host.connections.length, 1);
              assert.equal(host.connections[0], 'test3');

              host.process.kill();
              manager.stopListening();
              done();
            });
          });
        });
      });
    });
    it('should set a stopTimeout on a host once it no longer has any connections', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false,
        disconnectTimeout: 200,
        stopManagerIfNoConnections: false
      });

      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig, port: 0}, function(err, res, body) {
          assert.isNull(err);
          var host = manager.hosts[pathToTestConfig];
          var config = JSON.parse(host.output).config;
          host.connections.push('test');
          assert.isNull(host.stopTimeout);
          postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: 'test'}, function(err, res, body) {
            assert.isNull(err);

            assert.isObject(body);
            assert.equal(body.config, pathToTestConfig);
            assert.isTrue(body.started);
            assert.equal(body.status, 'Disconnected. Stopping host in 200ms');
            assert.equal(body.stopTimeout, 200);

            assert.equal(host.connections.length, 0);
            assert.isNotNull(host.stopTimeout);
            postToManagedHost({port: config.port}, 'counter', function(err, res, body) {
              assert.isNull(err);
              assert.equal(body, '1');
              assert.isObject(manager.hosts[pathToTestConfig]);
              setTimeout(function() {
                assert.isUndefined(manager.hosts[pathToTestConfig]);
                postToManagedHost({port: config.port}, 'counter', function(err, res, body) {
                  assert.instanceOf(err, Error);
                  manager.stopListening();
                  done();
                });
              }, 200);
            });
          });
        });
      });
    });
    it('should exit the process, if no more hosts are running', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false,
        disconnectTimeout: 200
      });

      var hasDisconnected = false;

      manager.exitIfNoConnections = function() {
        assert.isTrue(hasDisconnected);
        assert.equal(Object.keys(this.hosts).length, 0);
        manager.stopListening();
        done();
      };

      manager.listen(function() {
        postToManager(manager, '/host/start', {config: pathToTestConfig, port: 0}, function(err, res, body) {
          assert.isNull(err);
          var host = manager.hosts[pathToTestConfig];
          host.connections.push('test');
          assert.isNull(host.stopTimeout);
          postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: 'test'}, function(err, res, body) {
            assert.isNull(err);

            assert.isObject(body);
            assert.equal(body.config, pathToTestConfig);
            assert.isTrue(body.started);
            assert.equal(body.status, 'Disconnected. Stopping host in 200ms');
            assert.equal(body.stopTimeout, 200);

            assert.equal(host.connections.length, 0);
            assert.isNotNull(host.stopTimeout);
            hasDisconnected = true;
          });
        });
      });
    });
    it('should return errors, if a connection identifier is not provided', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/disconnect', {config: pathToTestConfig}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.equal(body, 'No `connection` data provided');
          manager.stopListening();
          done();
        });
      });
    });
    it('should not return errors, if the host is not running', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: 'test'}, function(err, res, body) {
          assert.equal(res.statusCode, 200);

          assert.isObject(body);
          assert.equal(body.config, pathToTestConfig);
          assert.isFalse(body.started);
          assert.equal(body.status, 'Host has already stopped');
          assert.isNull(body.stopTimeout);

          manager.stopListening();
          done();
        });
      });
    });
  });
  describe('/host/status endpoint', function() {
    it('should provide information about a host', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        postToManager(manager, '/host/status', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          assert.deepEqual(body, {started: false});
          postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
            assert.isNull(err);
            postToManager(manager, '/host/status', {config: pathToTestConfig}, function(err, res, body) {
              assert.isNull(err);
              assert.deepEqual(body, {started: true, host: manager.serializeHost(pathToTestConfig)});
              postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, body) {
                assert.isNull(err);
                manager.stopListening();
                done();
              });
            });
          });
        });
      });
    });
  });
});