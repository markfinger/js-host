'use strict';

var path = require('path');
var assert = require('chai').assert;
var _ = require('lodash');
var Manager = require('../lib/Manager');
var Host = require('../lib/Host');
var utils = require('./utils');

var pathToTestConfig = path.join(__dirname, 'test_config', 'config.js');
var pathToDuplicateConfig = path.join(__dirname, 'test_config', 'duplicate.js');

var post = function(host, serviceName, data, cb) {
  var config = JSON.parse(host.output);
  // Get around validation issues caused by (de)serialization issues
  config.services = null;
  // Prevent the logger from adding handlers to the process's emitter
  config.silent = true;
  utils.post(new Host(config), serviceName, data, cb);
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
  describe('#getHost()', function() {
    it('should accept a path to a config file, start a host on a random port, and keep track of the host', function(done) {
      var manager = new Manager({
        silent: true
      });
      var config = require(pathToTestConfig);
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
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
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        manager.getHost(pathToTestConfig, function(err, _host) {
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
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        var json = JSON.parse(host.output);
        assert.notEqual(json.port, config.port);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);
        manager.getHost(pathToDuplicateConfig, function(err, _host) {
          assert.isNull(err);
          assert.isObject(_host);
          var json = JSON.parse(_host.output);
          assert.notEqual(json.port, duplicateConfig.port);
          assert.notStrictEqual(_host, host);
          assert.strictEqual(manager.hosts[pathToDuplicateConfig], _host);
          post(host, 'echo', {data: {echo: 'foo'}, cacheKey: 'test'}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'foo');
            post(host, 'echo', {data: {echo: 'bar'}, cacheKey: 'test'}, function(err, res, body) {
              assert.isNull(err);
              assert.equal(body, 'foo');
              post(_host, 'echo', {data: {echo: 'bar'}, cacheKey: 'test'}, function(err, res, body) {
                assert.isNull(err);
                assert.equal(body, 'bar');
                post(_host, 'echo', {data: {echo: 'woz'}, cacheKey: 'test'}, function(err, res, body) {
                  assert.isNull(err);
                  assert.equal(body, 'bar');
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
    it('if a host exits, the manager should remove its record of it', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
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
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
        assert.strictEqual(manager.hosts[pathToTestConfig], host);

        post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'foo');
          manager.stopHost(pathToTestConfig, function(err, _host) {
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
      manager.stopHost(pathToTestConfig, function(err, host) {
        assert.instanceOf(err, Error);
        assert.isUndefined(host);
        done();
      });
    });
    it('accepts a timeout before shutting the host down', function(done) {
      var manager = new Manager({
        silent: true
      });
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
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
      manager.getHost(pathToTestConfig, function(err, host) {
        assert.isNull(err);
        assert.isObject(host);
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
            manager.getHost(pathToTestConfig, function(err, _host) {
              assert.isNull(host.stopTimeout);
              assert.isNull(err);
              assert.strictEqual(_host, host);
              post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
                assert.isNull(host.stopTimeout);
                assert.isFalse(hasStopped);
                assert.isNull(err);
                assert.equal(body, 'foo');
                manager.stopHost(pathToTestConfig, function(err, _host) {
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
});