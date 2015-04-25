'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('chai').assert;
var request = require('request');
var _ = require('lodash');
var Func = require('../lib/Func');
var Host = require('../lib/Host');
var echo = require('./test_functions/echo');

var post = require('./utils').post;

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
  describe('#config', function() {
    it('should accept a variety of notations for functions', function() {
      var funcs1 = [
        {
          name: 'foo',
          handler: function() {}
        }, {
          name: 'bar',
          handler: function() {}
        }
      ];

      var funcs2 = {
        foo: function(){},
        bar: function(){}
      };

      var funcs3 = {
        foo: {
          handler: function(){}
        },
        bar: {
          handler: function(){}
        }
      };

      var funcs4 = {
        foo: function(){},
        bar: {
          handler: function(){}
        }
      };

      [funcs1, funcs2, funcs3, funcs4].forEach(function(funcs) {
        var host = new Host({functions: funcs});
        assert.isArray(host.config.functions);
        assert.equal(host.config.functions.length, 2);
        assert.equal(host.config.functions[0].name, 'foo');
        assert.isFunction(host.config.functions[0].handler);
        assert.equal(host.config.functions[1].name, 'bar');
        assert.isFunction(host.config.functions[1].handler);
      });
    });
  });
  describe('#addFunction()', function() {
    it('should accept an object', function() {
      var host = new Host({silent: true});
      var func = {
        name: 'test',
        handler: function() {}
      };
      host.addFunction(func);
      assert.isDefined(host.functions.test);
      assert.instanceOf(host.functions.test, Func);
      assert.equal(host.functions.test.name, 'test');
      assert.strictEqual(host.functions.test.handler, func.handler);
    });
    it('should bind the function\'s `host` prop to itself', function(done) {
      var host = new Host({silent: true});
      var func = {
        name: 'test',
        handler: function() {
          assert.strictEqual(this.host, host);
          done();
        }
      };
      host.addFunction(func);
      assert.strictEqual(host.functions.test.host, host);
      host.functions.test.call({},function(){});
    });
    it('can be called multiple times', function() {
      var host = new Host({silent: true});
      host.addFunction({
        name: 'test1',
        handler: function() {}
      });
      host.addFunction({
        name: 'test2',
        handler: function() {}
      });
      assert.isDefined(host.functions.test1);
      assert.isDefined(host.functions.test2);
      assert.instanceOf(host.functions.test1, Func);
      assert.instanceOf(host.functions.test2, Func);
      assert.equal(host.functions.test1.name, 'test1');
      assert.equal(host.functions.test2.name, 'test2');
      assert.isFunction(host.functions.test1.handler);
      assert.isFunction(host.functions.test2.handler);
    });
    it('throws an error if a function is added with a conflicting name', function() {
      var host = new Host({silent: true});
      host.addFunction({
        name: 'test',
        handler: function() {}
      });
      assert.throws(
        function() {
          host.addFunction({
            name: 'test',
            handler: function() {}
          });
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
  describe('#functions', function() {
    it('can call a function with a callback', function(done) {
      var host = new Host({silent: true});
      host.addFunction({
        name: 'test',
        handler: function(data, cb) {
          assert.isObject(data);
          assert.isFunction(done);
          cb(null, 'success');
        }
      });
      host.functions.test.call({}, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'success');
        done();
      });
    });
    it('can optionally pass data to a function', function(done) {
      var host = new Host({silent: true});
      var dataProvided = {test: 'foo'};
      host.addFunction({
        name: 'test',
        handler: function(data, cb) {
          assert.strictEqual(data, dataProvided);
          cb(null, data.test);
        }
      });
      host.functions.test.call(dataProvided, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'foo');
        done();
      });
    });
    it('functions can complete asynchronously', function(done) {
      var host = new Host({silent: true});
      host.addFunction({
        name: 'test',
        handler: function(data, cb) {
          setTimeout(function() {
            cb(null, 'delayed success');
          }, 10);
        }
      });
      host.functions.test.call({}, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'delayed success');
        done();
      });
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
  describe('/config endpoint', function() {
    it('can expose a host\'s config as JSON', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true,
        functions: {
          foo: function() {}
        }
      });
      host.listen(function() {
        request(host.getUrl() + '/config', function(err, res, body) {
          assert.isNull(err);
          var config = JSON.parse(body);
          assert.isObject(config);
          assert.equal(config.address, host.config.address);
          assert.equal(config.port, host.config.port);
          assert.isArray(config.functions);
          assert.equal(config.functions.length, 1);
          assert.equal(config.functions[0].name, 'foo');
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

      host.addFunction({
        name: 'function1',
        handler: function(data, cb) {
          cb(null, 'in handler1');
        }
      });
      host.addFunction({
        name: 'function2',
        handler: function(data, cb) {
          cb(null, 'in handler2');
        }
      });

      host.listen(function() {
        post(host, 'foo', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          assert.equal(body, 'Not found');
          post(host, 'function1', function(err, res, body) {
            assert.equal(body, 'in handler1');
            post(host, 'function2', function(err, res, body) {
              assert.equal(body, 'in handler2');
              post(host, 'bar', function(err, res, body) {
                assert.equal(res.statusCode, '404');
                assert.equal(body, 'Not found');
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

      host.addFunction({
        name: 'text-test',
        handler: function(data, cb) {
          if (data.text !== text) {
            return cb('data.text does not match');
          }
          cb(null, 'success: ' + data.text);
        }
      });

      host.listen(function() {
        post(host, 'text-test', {data: {text: text}}, function(err, res, body) {
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

      host.addFunction({
        name: 'done-x1',
        handler: function(data, cb) {
          cb(null, 'some success');
        }
      });
      host.addFunction({
        name: 'done-x2',
        handler: function(data, cb) {
          cb('x2');
          cb(null, 'some success x2');
        }
      });
      host.addFunction({
        name: 'done-x3',
        handler: function(data, cb) {
          cb(null, 'some success x3');
          cb('x3');
          cb(null, 'some other success x3');
        }
      });

      host.listen(function() {
        post(host, 'done-x1', function(err, res, body) {
          assert.equal(res.statusCode, 200);
          assert.include(body, 'some success');
          post(host, 'done-x2', function(err, res, body) {
            assert.equal(res.statusCode, 500);
            assert.include(body, 'x2');
            post(host, 'done-x3', function(err, res, body) {
              assert.equal(res.statusCode, 200);
              assert.include(body, 'some success x3');
              host.stopListening();
              done();
            });
          });
        });
      });
    });
    it('a function\'s output can be cached via a `key` param', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      var cachedCount = 0;
      host.addFunction({
        name: 'cached_count',
        handler: function(data, cb) {
          cachedCount++;
          cb(null, cachedCount);
        }
      });

      var count = 0;
      host.addFunction({
        name: 'count',
        handler: function(data, cb) {
          count++;
          cb(null, count);
        }
      });

      host.listen(function() {
        post(host, 'cached_count', {key: 'test-key-1'}, function(err, res, body) {
          assert.equal(body, '1');
          post(host, 'cached_count', {key: 'test-key-1'}, function(err, res, body) {
            assert.equal(body, '1');
            post(host, 'count', function(err, res, body) {
              assert.equal(body, '1');
              post(host, 'count', function(err, res, body) {
                assert.equal(body, '2');
                post(host, 'count', function(err, res, body) {
                  assert.equal(body, '3');
                  post(host, 'cached_count', {key: 'test-key-2'}, function(err, res, body) {
                    assert.equal(body, '2');
                    post(host, 'cached_count', {key: 'test-key-1'}, function(err, res, body) {
                      assert.equal(body, '1');
                      post(host, 'cached_count', {key: 'test-key-2'}, function(err, res, body) {
                        assert.equal(body, '2');
                        host.stopListening();
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
  describe('#cacheTimeout', function() {
    it('can be used to set the default cache timeout of all functions', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true,
        cacheTimeout: 20
      });

      var count = 0;
      host.addFunction({
        name: 'test',
        handler: function(data, cb) {
          count++;
          cb(null, count);
        }
      });

      host.listen(function() {
        post(host, 'test', {key: 'test-key'}, function(err, res, body) {
          assert.equal(body, '1');
          post(host, 'test', {key: 'test-key'}, function(err, res, body) {
            assert.equal(body, '1');
            setTimeout(function() {
              post(host, 'test', {key: 'test-key'}, function(err, res, body) {
                assert.equal(body, '2');
                host.stopListening();
                done();
              });
            }, 20);
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
  describe('/type endpoint', function() {
    it('should return "Host"', function(done) {
      var host = new Host({
        silent: true,
        outputOnListen: false
      });
      host.listen(function() {
        request(host.getUrl() + '/type', function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'Host');
          host.stopListening();
          done();
        });
      });
    });
  });
});