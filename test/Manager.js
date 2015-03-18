var path = require('path');
var fs = require('fs');
var request = require('request');
var assert = require('chai').assert;
var Manager = require('../lib/Manager');
var Service = require('../lib/Service');

var echo = require('./test_services/echo');
var echoAsync = require('./test_services/echo_async');

describe('Manager', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Manager);
    });
    it('should instantiate with properties set correctly', function() {
      var manager = new Manager();
      assert.isObject(manager.config);
      assert.notStrictEqual(manager.config, manager.defaultConfig);
      assert.deepEqual(manager.config, manager.defaultConfig);
      assert.isObject(manager.services);
      assert.deepEqual(manager.services, Object.create(null));
    });
    it('the constructor should accept a config', function() {
      var config = {};
      var manager = new Manager(config);
      assert.notStrictEqual(manager.config, manager.defaultConfig);
      assert.strictEqual(manager.config, config);
      assert.deepEqual(manager.config, manager.defaultConfig);
    });
  });
  describe('#addService()', function() {
    it('should accept an object', function() {
      var manager = new Manager();
      var service = {
        name: 'test',
        handler: function() {}
      };
      manager.addService(service);
      assert.isDefined(manager.services.test);
      assert.instanceOf(manager.services.test, Service);
      assert.equal(manager.services.test.name, 'test');
      assert.strictEqual(manager.services.test.handler, service.handler);
    });
    it('can be called multiple times', function() {
      var manager = new Manager();
      manager.addService({
        name: 'test1',
        handler: function() {
        }
      });
      manager.addService({
        name: 'test2',
        handler: function() {
        }
      });
      assert.isDefined(manager.services.test1);
      assert.isDefined(manager.services.test2);
      assert.instanceOf(manager.services.test1, Service);
      assert.instanceOf(manager.services.test2, Service);
      assert.equal(manager.services.test1.name, 'test1');
      assert.equal(manager.services.test2.name, 'test2');
      assert.isFunction(manager.services.test1.handler);
      assert.isFunction(manager.services.test2.handler);
    });
    it('throws an error if a service is added with a conflicting name', function() {
      var manager = new Manager();
      manager.addService({
        name: 'test',
        handler: function() {
        }
      });
      assert.throws(
        function() {
          manager.addService({
            name: 'test',
            handler: function() {
            }
          });
        },
        'A service has already been defined with the name "test"'
      );
    });
  });
  describe('#callService()', function() {
    it('can call a service with a callback', function(done) {
      var manager = new Manager();
      manager.addService({
        name: 'test',
        handler: function(data, done) {
          assert.isObject(data);
          assert.isFunction(done);
          done(null, 'success');
        }
      });
      manager.callService('test', function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'success');
        done();
      });
    });
    it('can optionally pass data to a service', function(done) {
      var manager = new Manager();
      var dataProvided = {test: 'foo'};
      manager.addService({
        name: 'test',
        handler: function(data, done) {
          assert.strictEqual(data, dataProvided);
          done(null, data.test);
        }
      });
      manager.callService('test', dataProvided, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'foo');
        done();
      });
    });
    it('services can complete asynchronously', function(done) {
      var manager = new Manager();
      manager.addService({
        name: 'test',
        handler: function(data, done) {
          setTimeout(function() {
            done(null, 'delayed success');
          }, 10);
        }
      });
      manager.callService('test', function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'delayed success');
        done();
      });
    });
  });
  describe('#listen()', function() {
    it('can start the server', function(done) {
      var manager = new Manager({
        outputOnListen: false
      });
      manager.listen(function() {
        manager.stopListening();
        done();
      });
    });
  });
  describe('#debugGetHandler()', function() {
    it('is not served by default', function(done) {
      var manager = new Manager({
        outputOnListen: false
      });
      manager.listen(function() {
        request('http://127.0.0.1:63578', function(err, res, body) {
          assert.equal(res.statusCode, 404);
          manager.stopListening();
          done();
        });
      });
    });
    it('respects the debug flag', function(done) {
      var manager = new Manager({
        outputOnListen: false,
        debug: true
      });
      manager.addService({
        name: 'test',
        handler: function() {}
      });
      manager.listen(function() {
        request('http://127.0.0.1:63578', function(err, res, body) {
          assert.equal(body, '<html><body><h1>Services</h1><ul><li>test</li></ul></body></html>');
          manager.stopListening();
          done();
        });
      });
    });
  });
  describe('#router()', function() {
    it('requests can be routed to a service', function(done) {
      var manager = new Manager({
        outputOnListen: false
      });

      manager.addService({
        name: 'service1',
        handler: function(data, done) {
          done(null, 'in handler1');
        }
      });
      manager.addService({
        name: 'service2',
        handler: function(data, done) {
          done(null, 'in handler2');
        }
      });

      manager.listen(function() {
        request.post('http://127.0.0.1:63578/', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          request.post('http://127.0.0.1:63578/service1', function(err, res, body) {
            assert.equal(body, 'in handler1');
            request.post('http://127.0.0.1:63578/service2', function(err, res, body) {
              assert.equal(body, 'in handler2');
              request.post('http://127.0.0.1:63578/service3', function(err, res, body) {
                assert.equal(res.statusCode, '404');
                assert.equal(body, 'Not found');
                manager.stopListening();
                done();
              });
            });
          });
        });
      });
    });
    it('services can be handled asynchronously', function(done) {
      var manager = new Manager({
        logErrors: false,
        outputOnListen: false
      });

      manager.addService({
        name: 'echo',
        handler: echo
      });
      manager.addService({
        name: 'echo-async',
        handler: echoAsync
      });

      manager.listen(function() {
        request.post({url: 'http://127.0.0.1:63578/echo', json: true, body: { echo: 'echo-test' }}, function(err, res, body) {
          assert.equal(body, 'echo-test');
          request.post('http://127.0.0.1:63578/echo', function(err, res, body) {
            assert.equal(res.statusCode, 500);
            assert.include(body, '`echo` data not provided');
            request.post({url: 'http://127.0.0.1:63578/echo-async', json: true, body: { echo: 'echo-async-test' }}, function(err, res, body) {
              assert.equal(body, 'echo-async-test');
              request.post('http://127.0.0.1:63578/echo-async', function(err, res, body) {
                assert.equal(res.statusCode, 500);
                assert.include(body, '`echo` data not provided');
                manager.stopListening();
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

      var manager = new Manager({
        outputOnListen: false
      });

      manager.addService({
        name: 'text-test',
        handler: function(data, done) {
          if (data.text !== text) {
            return done('data.text does not match');
          }
          done(null, 'success: ' + data.text);
        }
      });

      manager.listen(function() {
        request.post({url: 'http://127.0.0.1:63578/text-test', json: true, body: { text: text }}, function(err, res, body) {
          assert.equal(body, 'success: ' + text);
          manager.stopListening();
          done();
        });
      });
    });
    it('a service\'s `done` callback can only be called once', function(done) {
      var manager = new Manager({
        outputOnListen: false
      });

      manager.addService({
        name: 'done-x1',
        handler: function(data, done) {
          done(null, 'some success');
        }
      });
      manager.addService({
        name: 'done-x2',
        handler: function(data, done) {
          done('x2');
          done(null, 'some success x2');
        }
      });
      manager.addService({
        name: 'done-x3',
        handler: function(data, done) {
          done(null, 'some success x3');
          done('x3');
          done(null, 'some other success x3');
        }
      });

      var errorsTriggered = 0;
      var postReceived = false;

      var triggerDone = function() {
        manager.stopListening();
        done();
      };

      manager.onError = function(err) {
        errorsTriggered++;
        assert.include([
          'x2',
          'x3',
          '`done` callback was called more than once'
        ], err instanceof Error ? err.message : err);
        if (errorsTriggered === 4 && postReceived) {
          triggerDone();
        }
      };

      manager.listen(function() {
        request.post('http://127.0.0.1:63578/done-x1', function(err, res, body) {
          assert.equal(res.statusCode, 200);
          assert.include(body, 'some success');
          request.post('http://127.0.0.1:63578/done-x2', function(err, res, body) {
            assert.equal(res.statusCode, 500);
            assert.include(body, 'x2');
            request.post('http://127.0.0.1:63578/done-x3', function(err, res, body) {
              assert.equal(res.statusCode, 200);
              assert.include(body, 'some success x3');
              postReceived = true;
              if (errorsTriggered === 4) {
                triggerDone();
              }
            });
          });
        });
      });
    });
    it('a service\'s output can be cached via a `x-cache-key` header', function(done) {
      var manager = new Manager({
        outputOnListen: false
      });

      var cachedCount = 0;
      manager.addService({
        name: 'cached-count',
        handler: function(data, done) {
          cachedCount++;
          done(null, ''+cachedCount);
        }
      });

      var count = 0;
      manager.addService({
        name: 'count',
        handler: function(data, done) {
          count++;
          done(null, ''+count);
        }
      });

      var cachedCountOptions1 = {
        url: 'http://127.0.0.1:63578/cached-count',
        headers: {
          'x-cache-key': 'test-key-1'
        }
      };

      var cachedCountOptions2 = {
        url: 'http://127.0.0.1:63578/cached-count',
        headers: {
          'x-cache-key': 'test-key-2'
        }
      };

      manager.listen(function() {
        request.post(cachedCountOptions1, function(err, res, body) {
          assert.equal(body, '1');
          request.post(cachedCountOptions1, function(err, res, body) {
            assert.equal(body, '1');
            request.post('http://127.0.0.1:63578/count', function(err, res, body) {
              assert.equal(body, '1');
              request.post('http://127.0.0.1:63578/count', function(err, res, body) {
                assert.equal(body, '2');
                request.post('http://127.0.0.1:63578/count', function(err, res, body) {
                  assert.equal(body, '3');
                  request.post(cachedCountOptions2, function(err, res, body) {
                    assert.include(body, '2');
                    request.post(cachedCountOptions1, function(err, res, body) {
                      assert.include(body, '1');
                      request.post(cachedCountOptions2, function(err, res, body) {
                        assert.include(body, '2');
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
});