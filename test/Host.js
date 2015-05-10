'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('./utils').assert;
var request = require('request');
var _ = require('lodash');
var Func = require('../lib/Func');
var Host = require('../lib/Host');
var echo = require('./test_functions/echo');
var version = require('../package').version;

var postToHost = require('./utils').postToHost;

describe('Host', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Host);
    });
    it('should instantiate with properties set correctly', function() {
      var host = new Host({silent: true});
      assert.isObject(host.config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.isObject(host.functions);
      assert.deepEqual(
        _.omit(host.config, 'silent'),
        _.omit(host.defaultConfig, 'silent')
      );
      assert.deepEqual(host.functions, Object.create(null));
    });
    it('the constructor should accept a config', function() {
      var config = {silent: true};
      var host = new Host(config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.strictEqual(host.config, config);
      assert.deepEqual(
        _.omit(host.config, 'silent'),
        _.omit(host.defaultConfig, 'silent')
      );
    });
  });
  describe('#addFunction()', function() {
    it('should accept an object', function() {
      var host = new Host({silent: true});
      var func = function() {};
      host.addFunction('test', func);
      assert.isDefined(host.functions.test);
      assert.instanceOf(host.functions.test, Func);
      assert.equal(host.functions.test.name, 'test');
      assert.strictEqual(host.functions.test.handler, func);
    });
    it('can be called multiple times', function() {
      var host = new Host({silent: true});
      var func1 = function() {};
      var func2 = function() {};
      host.addFunction('test1', func1);
      host.addFunction('test2', func2);
      assert.isDefined(host.functions.test1);
      assert.isDefined(host.functions.test2);
      assert.instanceOf(host.functions.test1, Func);
      assert.instanceOf(host.functions.test2, Func);
      assert.equal(host.functions.test1.name, 'test1');
      assert.equal(host.functions.test2.name, 'test2');
      assert.isFunction(host.functions.test1.handler);
      assert.isFunction(host.functions.test2.handler);
      assert.strictEqual(host.functions.test1.handler, func1);
      assert.strictEqual(host.functions.test2.handler, func2);
    });
    it('throws an error if a function is added with a conflicting name', function() {
      var host = new Host({silent: true});
      host.addFunction('test', function() {});
      assert.throws(
        function() {
          host.addFunction('test', function() {});
        },
        'A function has already been defined with the name "test"'
      );
    });
  });
  describe('#getUrl()', function() {
    it('should respect the defaults', function() {
      assert.equal(
        new Host({silent: true}).getUrl(),
        'http://' + Host.prototype.defaultConfig.address + ':' + Host.prototype.defaultConfig.port
      );
    });
    it('should respect the config', function() {
      assert.equal(
        new Host({
          address: 'foo',
          port: 'bar',
          silent: true
        }).getUrl(),
        'http://foo:bar'
      );
    });
  });
  describe('#listen()', function() {
    it('can start the listenerServer', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });
      host.listen(function() {
        host.stopListening();
        done();
      });
    });
  });
  describe('#listenerServer', function() {
    it('is set when listening', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });
      assert.isNull(host.listenerServer);
      host.listen(function() {
        assert.isNotNull(host.listenerServer);
        host.stopListening();
        done();
      });
    });
    it('is unset after listening has stopped', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });
      assert.isNull(host.listenerServer);
      host.listen(function() {
        assert.isNotNull(host.listenerServer);
        host.stopListening();
        assert.isNull(host.listenerServer);
        done();
      });
    });
  });
  describe('/status endpoint', function() {
    it('can expose a host\'s status as JSON', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true,
        functions: {
          foo: function() {}
        }
      });
      host.listen(function() {
        request(host.getUrl() + '/status', function(err, res, body) {
          assert.isNull(err);
          var status = JSON.parse(body);

          assert.isObject(status);
          assert.equal(status.type, 'Host');
          assert.isDefined(status.version);
          assert.equal(status.version, version);
          assert.isUndefined(status.logger);
          var config = status.config;
          assert.isObject(config);
          assert.equal(config.address, host.config.address);
          assert.equal(config.port, host.config.port);
          assert.isArray(config.functions);
          assert.include(config.functions, 'foo');

          host.stopListening();
          done();
        });
      });
    });
  });
  describe('function routing and handling', function() {
    it('requests can be routed to a function', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addFunction('function1', function(data, cb) {
        cb(null, 'in handler1');
      });
      host.addFunction('function2', function(data, cb) {
        cb(null, 'in handler2');
      });

      host.listen(function() {
        postToHost(host, 'foo', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          assert.equal(body, 'Not found. Unknown function "foo"');
          postToHost(host, 'function1', function(err, res, body) {
            assert.equal(body, 'in handler1');
            postToHost(host, 'function2', function(err, res, body) {
              assert.equal(body, 'in handler2');
              postToHost(host, 'bar', function(err, res, body) {
                assert.equal(res.statusCode, '404');
                assert.equal(body, 'Not found. Unknown function "bar"');
                host.stopListening();
                done();
              });
            });
          });
        });
      });
    });
    it('functions can receive and send large data sets', function(done) {
      // A 2.5mb text file
      var testTextFile = path.join(__dirname, 'test_data', 'test.txt');
      var text = fs.readFileSync(testTextFile).toString('utf-8');

      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addFunction('text-test', function(data, cb) {
        if (data.text !== text) {
          return cb('data.text does not match');
        }
        cb(null, 'success: ' + data.text);
      });

      host.listen(function() {
        postToHost(host, 'text-test', {data: {text: text}}, function(err, res, body) {
          assert.equal(body, 'success: ' + text);
          host.stopListening();
          done();
        });
      });
    });
    it('a function\'s `done` callback can only be called once', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addFunction('done-x1', function(data, cb) {
        cb(null, 'some success');
      });
      host.addFunction('done-x2', function(data, cb) {
        cb('x2');
        cb(null, 'some success x2');
      });
      host.addFunction('done-x3', function(data, cb) {
        cb(null, 'some success x3');
        cb('x3');
        cb(null, 'some other success x3');
      });

      host.listen(function() {
        postToHost(host, 'done-x1', function(err, res, body) {
          assert.equal(res.statusCode, 200);
          assert.include(body, 'some success');
          postToHost(host, 'done-x2', function(err, res, body) {
            assert.equal(res.statusCode, 500);
            assert.include(body, 'x2');
            postToHost(host, 'done-x3', function(err, res, body) {
              assert.equal(res.statusCode, 200);
              assert.include(body, 'some success x3');
              host.stopListening();
              done();
            });
          });
        });
      });
    });
  });
  describe('#logger', function() {
    it('should be configurable via a config\'s `logger` prop', function() {
      var logger = {};
      var host = new Host({
        logger: logger
      });
      assert.strictEqual(host.logger, logger);
    });
  });
});