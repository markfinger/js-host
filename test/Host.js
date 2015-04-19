'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('chai').assert;
var request = require('request');
var _ = require('lodash');
var Service = require('../lib/Service');
var Host = require('../lib/Host');
var echo = require('./test_services/echo');

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
      assert.isObject(host.services);
      assert.deepEqual(
        _.omit(host.config, 'silent'),
        _.omit(host.defaultConfig, 'silent')
      );
      assert.deepEqual(host.services, Object.create(null));
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
    it('should accept a variety of notations for services', function() {
      var services1 = [
        {
          name: 'foo',
          handler: function() {}
        }, {
          name: 'bar',
          handler: function() {}
        }
      ];

      var services2 = {
        foo: function(){},
        bar: function(){}
      };

      var services3 = {
        foo: {
          handler: function(){}
        },
        bar: {
          handler: function(){}
        }
      };

      var services4 = {
        foo: function(){},
        bar: {
          handler: function(){}
        }
      };

      [services1, services2, services3, services4].forEach(function(services) {
        var host = new Host({services: services});
        assert.isArray(host.config.services);
        assert.equal(host.config.services.length, 2);
        assert.equal(host.config.services[0].name, 'foo');
        assert.isFunction(host.config.services[0].handler);
        assert.equal(host.config.services[1].name, 'bar');
        assert.isFunction(host.config.services[1].handler);
      });
    });
  });
  describe('#addService()', function() {
    it('should accept an object', function() {
      var host = new Host({silent: true});
      var service = {
        name: 'test',
        handler: function() {}
      };
      host.addService(service);
      assert.isDefined(host.services.test);
      assert.instanceOf(host.services.test, Service);
      assert.equal(host.services.test.name, 'test');
      assert.strictEqual(host.services.test.handler, service.handler);
    });
    it('should bind the service\'s `host` prop to itself', function(done) {
      var host = new Host({silent: true});
      var service = {
        name: 'test',
        handler: function() {
          assert.strictEqual(this.host, host);
          done();
        }
      };
      host.addService(service);
      assert.strictEqual(host.services.test.host, host);
      host.callService('test');
    });
    it('can be called multiple times', function() {
      var host = new Host({silent: true});
      host.addService({
        name: 'test1',
        handler: function() {}
      });
      host.addService({
        name: 'test2',
        handler: function() {}
      });
      assert.isDefined(host.services.test1);
      assert.isDefined(host.services.test2);
      assert.instanceOf(host.services.test1, Service);
      assert.instanceOf(host.services.test2, Service);
      assert.equal(host.services.test1.name, 'test1');
      assert.equal(host.services.test2.name, 'test2');
      assert.isFunction(host.services.test1.handler);
      assert.isFunction(host.services.test2.handler);
    });
    it('throws an error if a service is added with a conflicting name', function() {
      var host = new Host({silent: true});
      host.addService({
        name: 'test',
        handler: function() {}
      });
      assert.throws(
        function() {
          host.addService({
            name: 'test',
            handler: function() {}
          });
        },
        'A service has already been defined with the name "test"'
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
  describe('#callService()', function() {
    it('can call a service with a callback', function(done) {
      var host = new Host({silent: true});
      host.addService({
        name: 'test',
        handler: function(data, done) {
          assert.isObject(data);
          assert.isFunction(done);
          done(null, 'success');
        }
      });
      host.callService('test', function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'success');
        done();
      });
    });
    it('can optionally pass data to a service', function(done) {
      var host = new Host({silent: true});
      var dataProvided = {test: 'foo'};
      host.addService({
        name: 'test',
        handler: function(data, done) {
          assert.strictEqual(data, dataProvided);
          done(null, data.test);
        }
      });
      host.callService('test', dataProvided, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'foo');
        done();
      });
    });
    it('services can complete asynchronously', function(done) {
      var host = new Host({silent: true});
      host.addService({
        name: 'test',
        handler: function(data, done) {
          setTimeout(function() {
            done(null, 'delayed success');
          }, 10);
        }
      });
      host.callService('test', function(err, output) {
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
        services: {
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
          assert.isArray(config.services);
          assert.equal(config.services.length, 1);
          assert.equal(config.services[0].name, 'foo');
          host.stopListening();
          done();
        });
      });
    });
  });
  describe('service routing and handling', function() {
    it('requests can be routed to a service', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addService({
        name: 'service1',
        handler: function(data, done) {
          done(null, 'in handler1');
        }
      });
      host.addService({
        name: 'service2',
        handler: function(data, done) {
          done(null, 'in handler2');
        }
      });

      host.listen(function() {
        post(host, 'foo', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          assert.equal(body, 'Not found');
          post(host, 'service1', function(err, res, body) {
            assert.equal(body, 'in handler1');
            post(host, 'service2', function(err, res, body) {
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
    it('services can receive and send large data sets', function(done) {
      // A 2.5mb text file
      var testTextFile = path.join(__dirname, 'test_data', 'test.txt');
      var text = fs.readFileSync(testTextFile).toString('utf-8');

      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addService({
        name: 'text-test',
        handler: function(data, done) {
          if (data.text !== text) {
            return done('data.text does not match');
          }
          done(null, 'success: ' + data.text);
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
    it('a service\'s `done` callback can only be called once', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      host.addService({
        name: 'done-x1',
        handler: function(data, done) {
          done(null, 'some success');
        }
      });
      host.addService({
        name: 'done-x2',
        handler: function(data, done) {
          done('x2');
          done(null, 'some success x2');
        }
      });
      host.addService({
        name: 'done-x3',
        handler: function(data, done) {
          done(null, 'some success x3');
          done('x3');
          done(null, 'some other success x3');
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
    it('a service\'s output can be cached via a `cache-key` param', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true
      });

      var cachedCount = 0;
      host.addService({
        name: 'cached-count',
        handler: function(data, done) {
          cachedCount++;
          done(null, cachedCount);
        }
      });

      var count = 0;
      host.addService({
        name: 'count',
        handler: function(data, done) {
          count++;
          done(null, count);
        }
      });

      host.listen(function() {
        post(host, 'cached-count', {cacheKey: 'test-key-1'}, function(err, res, body) {
          assert.equal(body, '1');
          post(host, 'cached-count', {cacheKey: 'test-key-1'}, function(err, res, body) {
            assert.equal(body, '1');
            post(host, 'count', function(err, res, body) {
              assert.equal(body, '1');
              post(host, 'count', function(err, res, body) {
                assert.equal(body, '2');
                post(host, 'count', function(err, res, body) {
                  assert.equal(body, '3');
                  post(host, 'cached-count', {cacheKey: 'test-key-2'}, function(err, res, body) {
                    assert.equal(body, '2');
                    post(host, 'cached-count', {cacheKey: 'test-key-1'}, function(err, res, body) {
                      assert.equal(body, '1');
                      post(host, 'cached-count', {cacheKey: 'test-key-2'}, function(err, res, body) {
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
    it('can be used to set the default cache timeout of all services', function(done) {
      var host = new Host({
        outputOnListen: false,
        silent: true,
        cacheTimeout: 20
      });

      var count = 0;
      host.addService({
        name: 'test',
        handler: function(data, done) {
          count++;
          done(null, count);
        }
      });

      host.listen(function() {
        post(host, 'test', {cacheKey: 'test-key'}, function(err, res, body) {
          assert.equal(body, '1');
          post(host, 'test', {cacheKey: 'test-key'}, function(err, res, body) {
            assert.equal(body, '1');
            setTimeout(function() {
              post(host, 'test', {cacheKey: 'test-key'}, function(err, res, body) {
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