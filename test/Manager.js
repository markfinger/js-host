'use strict';

var path = require('path');
var assert = require('chai').assert;
var _ = require('lodash');
var request = require('request');
var packageJson = require('../package.json');
var Manager = require('../lib/Manager');
var Host = require('../lib/Host');
var utils = require('./utils');

var pathToTestConfig = path.join(__dirname, 'test_config', 'config.js');
var pathToDuplicateConfig = path.join(__dirname, 'test_config', 'duplicate.js');

var post = function(host, funcName, data, cb) {
  var config = host.output ? JSON.parse(host.output) : host;
  // Get around validation issues caused by (de)serialization issues
  config.functions = null;
  // Prevent the logger from adding handlers to the process's emitter
  config.silent = true;
  utils.post(new Host(config), funcName, data, cb);
};

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
  describe('#startHost()', function() {
    it('should accept a path to a config file and start a host on a random port', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.startHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          host.process.kill();
          done();
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
        request.post({url: manager.getUrl() + '/host/start?config=' + encodeURIComponent(pathToTestConfig)}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(res.statusCode, 200);
          var host = JSON.parse(body);
          assert.isTrue(host.started);
          var config = JSON.parse(host.output);
          assert.notEqual(config.port, testConfig.port);
          post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'test');
            assert.isObject(manager.hosts[pathToTestConfig]);
            manager.hosts[pathToTestConfig].process.kill();
            manager.stopListening();
            done();
          });
        });
      });
    })
  });
  describe('#getHost()', function() {
    it('should accept a path to a config file, start a host on a random port, and keep track of the host', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          host.process.kill();
          done();
        });
      });
    });
    it('should only run one host per config file', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        manager.getHost(pathToTestConfig, function(err, _host, started) {
          assert.isFalse(started);
          assert.isNull(err);
          assert.strictEqual(_host, host);
          assert.strictEqual(manager.hosts[pathToTestConfig], _host);
          _host.process.kill();
          done();
        });
      });
    });
    it('can run multiple hosts at once', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      var duplicateConfig = require(pathToDuplicateConfig);
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        manager.getHost(pathToDuplicateConfig, function(err, _host, started) {
          assert.isNull(err);
          assert.isObject(_host);
          assert.isTrue(started);
          var json = JSON.parse(_host.output);
          assert.notEqual(json.port, duplicateConfig.port);
          assert.notStrictEqual(_host, host);
          assert.strictEqual(manager.hosts[pathToDuplicateConfig], _host);
          post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'foo');
            post(host, 'echo', {data: {echo: 'bar'}}, function(err, res, body) {
              assert.isNull(err);
              assert.equal(body, 'bar');
              post(_host, 'echo', {data: {echo: 'woz'}}, function(err, res, body) {
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
    it('if a host exits, the manager should remove its record of it', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        host.process.kill();
        setTimeout(function() {
          assert.isUndefined(manager.hosts[pathToTestConfig]);
          done();
        }, 50);
      });
    });
  });
  describe('#stopHost()', function() {
    it('should accept a path to a config file, and stop the host', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          manager.stopHost(pathToTestConfig, null, function(err, _host) {
            assert.isNull(err);
            assert.strictEqual(host, _host);
            assert.isUndefined(manager.hosts[pathToTestConfig]);
            post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
              assert.instanceOf(err, Error);
              done();
            });
          });
        });
      });
    });
    it('should return errors, if the host is not running', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.stopHost(pathToTestConfig, null, function(err, host) {
        assert.instanceOf(err, Error);
        assert.isUndefined(host);
        done();
      });
    });
    it('accepts a timeout before shutting the host down', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          var hasStopped = false;
          manager.stopHost(pathToTestConfig, 250, function(err, _host) {
            hasStopped = true;
            assert.isNull(err);
            assert.strictEqual(host, _host);
            assert.isUndefined(manager.hosts[pathToTestConfig]);
            post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
              assert.instanceOf(err, Error);
              done();
            });
          });
          setTimeout(function() {
            assert.isFalse(hasStopped);
            post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
              assert.isFalse(hasStopped);
              assert.isNull(err);
              assert.equal(body, 'foo');
            });
          }, 50);
        });
      });
    });
    it('if a getHost request comes in while a stopHost timer is ticking, the timer is cancelled', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host, started) {
        assert.isNull(err);
        assert.isObject(host);
        assert.isTrue(started);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        assert.isNull(host.stopTimeout);
        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          var hasStopped = false;
          manager.stopHost(pathToTestConfig, 250, function(err, _host) {
            hasStopped = true;
            assert.isTrue(false, 'this should never run');
          });
          assert.isNotNull(host.stopTimeout);
          setTimeout(function() {
            assert.isFalse(hasStopped);
            assert.isNotNull(host.stopTimeout);
            manager.getHost(pathToTestConfig, function(err, _host, started) {
              assert.isNull(host.stopTimeout);
              assert.isNull(err);
              assert.strictEqual(_host, host);
              assert.isFalse(started);
              post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
                assert.isNull(host.stopTimeout);
                assert.isFalse(hasStopped);
                assert.isNull(err);
                assert.equal(body, 'foo');
                manager.stopHost(pathToTestConfig, null, function(err, _host) {
                  assert.isNull(_host.stopTimeout);
                  assert.isNull(err);
                  assert.isUndefined(manager.hosts[pathToTestConfig]);
                  post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
                    assert.instanceOf(err, Error);
                    done();
                  });
                });
              });
            });
          }, 50);
        });
      });
    });
  });
  describe('/host/stop endpoint', function() {
    it('should be able to stop a host', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      var testConfig = require(pathToTestConfig);
      manager.listen(function() {
        manager.getHost(pathToTestConfig, function(err, host) {
          post(host, 'echo', {data: {'echo': 'test'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'test');
            assert.isObject(manager.hosts[pathToTestConfig]);
            request.post({url: manager.getUrl() + '/host/stop?config=' + encodeURIComponent(pathToTestConfig)}, function(err, res, body) {
              setTimeout(function() {
                assert.isNull(err);
                assert.equal(res.statusCode, 200);
                assert.isUndefined(manager.hosts[pathToTestConfig]);
                var config = JSON.parse(body);
                assert.notEqual(config.port, testConfig.port);
                setTimeout(function() {
                  post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                    assert.instanceOf(err, Error);
                    manager.stopListening();
                    done();
                  });
                }, 50);
              }, 50);
            });
          });
        });
      });
    });
    it('should accept a `timeout` param to delay stopping the host', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        manager.getHost(pathToTestConfig, function(err, host) {
          post(host, 'echo', {data: {'echo': 'test'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'test');
            assert.isObject(manager.hosts[pathToTestConfig]);
            request.post(
              {url: manager.getUrl() + '/host/stop?timeout=250' + '&config=' + encodeURIComponent(pathToTestConfig)},
              function(err, res, body) {
                assert.isNull(err);
                assert.equal(res.statusCode, 200);
                assert.isObject(manager.hosts[pathToTestConfig]);
                var config = JSON.parse(body);
                post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                  assert.isNull(err);
                  assert.equal(body, 'test');
                  setTimeout(function() {
                    post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                      assert.instanceOf(err, Error);
                      manager.stopListening();
                      done();
                    });
                  }, 250);
                });
              }
            );
          });
        });
      });
    });
  });
  describe('/host/start & /host/stop integration', function() {
    it('after a request to /host/stop with a `timeout` param, a request to /host/start should stop the timer', function(done) {
      var manager = new Manager({
        silent: true,
        outputOnListen: false
      });
      manager.listen(function() {
        manager.getHost(pathToTestConfig, function(err, host) {
          request.post(
            {url: manager.getUrl() + '/host/stop?timeout=250' + '&config=' + encodeURIComponent(pathToTestConfig)},
            function(err, res, body) {
              assert.isNull(err);
              setTimeout(function() {
                assert.isNotNull(manager.hosts[pathToTestConfig].stopTimeout);
                request.post(
                  {url: manager.getUrl() + '/host/start?config=' + encodeURIComponent(pathToTestConfig)},
                  function(err, res, body) {
                    assert.isNull(err);
                    assert.equal(res.statusCode, 200);
                    assert.isObject(manager.hosts[pathToTestConfig]);
                    assert.isNull(manager.hosts[pathToTestConfig].stopTimeout);
                    host = JSON.parse(body);
                    assert.isFalse(host.started);
                    var config = JSON.parse(host.output);
                    setTimeout(function() {
                      post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                        assert.isNull(err);
                        assert.equal(body, 'test');
                        setTimeout(function() {
                          post({port: config.port}, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                            assert.isNull(err, Error);
                            assert.isObject(manager.hosts[pathToTestConfig]);
                            assert.isNull(manager.hosts[pathToTestConfig].stopTimeout);
                            manager.hosts[pathToTestConfig].process.kill();
                            manager.stopListening();
                            done();
                          });
                        }, 250);
                      });
                    }, 250);
                  }
                );
              }, 50);
            }
          );
        });
      });
    });
  });
  describe('/status endpoint', function() {
    it('can expose a manager\'s status as JSON', function(done) {
      var manager = new Manager({
        outputOnListen: false,
        silent: true,
        functions: [{
          name: 'foo',
          handler: function() {}
        }]
      });
      manager.listen(function() {
        request(manager.getUrl() + '/status', function(err, res, body) {
          assert.isNull(err);

          var status = JSON.parse(body);
          assert.equal(status.type, 'Manager');
          var config = status.config;
          assert.isDefined(status.version);
          assert.equal(status.version, packageJson.version);
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
});