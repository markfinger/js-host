'use strict';

var assert = require('chai').assert;
var Service = require('../lib/Service');

describe('Service', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Service);
    });
    it('should accept an object and initialise properly', function() {
      var obj = {
        name: 'echo',
        handler: function() {},
        cacheTimeout: null
      };
      var service = new Service(obj);
      assert.equal(service.name, 'echo');
      assert.strictEqual(service.handler, obj.handler);
    });
  });
  describe('#name', function() {
    it('should be validated', function() {
      new Service({
        name: 'test', handler: function() {}, cacheTimeout: null
      });
      assert.throws(
        function() {
          new Service({});
        },
        '"undefined" is not a valid service name'
      );
      assert.throws(
        function() {
          new Service({name: undefined});
        },
        '"undefined" is not a valid service name'
      );
      assert.throws(
        function() {
          new Service({name: null});
        },
        '"null" is not a valid service name'
      );
      assert.throws(
        function() {
          new Service({name: false});
        },
        '"false" is not a valid service name'
      );
      assert.throws(
        function() {
          new Service({name: ''});
        },
        '"" is not a valid service name'
      );
    });
  });
  describe('#handler', function() {
    it('should be validated', function() {
      new Service({
        name: 'test', handler: function() {}, cacheTimeout: null
      });
      assert.throws(
        function() {
          new Service({name: 'test'});
        },
        'Service handlers must be a function'
      );
      assert.throws(
        function() {
          new Service({name: 'test', handler: {}});
        },
        'Service handlers must be a function'
      );
    });
  });
  describe('#call()', function() {
    it('the output of services can be cached', function(done) {
      var service = new Service({
        name: 'test',
        handler: function(data, done) {
          setTimeout(function() {
            done(null, data.count);
          }, 10);
        },
        cacheTimeout: null
      });

      assert.equal(service.cache.get('test-key'), null);

      service.call({count: 1}, 'test-key', function(err, output) {
        assert.isNull(err);
        assert.equal(output, 1);
        assert.equal(service.cache.get('test-key'), 1);

        service.call({count: 2}, 'test-key', function(err, output) {
          assert.isNull(err);
          assert.equal(output, 1);

          service.cache.set('test-key', 3);

          service.call({count: 4}, 'test-key', function(err, output) {
            assert.isNull(err);
            assert.equal(output, 3);

            service.call({count: 4}, 'another-test-key', function(err, output) {
              assert.isNull(err);
              assert.equal(output, 4);
              done();
            });
          });
        });
      });
    });
    it('the handler should be provided with a context', function(done) {
      var service = new Service({
        name: 'test',
        host: 'foo host',
        handler: function() {
          assert.notStrictEqual(this, service);
          assert.notStrictEqual(this, global);
          assert.isObject(this);
          assert.equal(this.name, 'test');
          assert.equal(this.host, 'foo host');
          done();
        },
        cacheTimeout: null
      });
      service.call();
    });
    it('if a cache key is defined, successive calls to a service will block until the first completes', function(done) {
      var service = new Service({
        name: 'test',
        handler: function(data, done) {
          setTimeout(function() {
            done(null, data.count);
          }, 25);
        },
        cacheTimeout: null
      });

      assert.equal(service.cache.get('test-key'), null);
      assert.isUndefined(service.pending['test-key']);

      service.call({count: 1}, 'test-key', function(err, output) {
        assert.equal(service.pending['test-key'].length, 0);

        assert.isNull(err);
        assert.equal(output, 1);
        assert.equal(service.cache.get('test-key'), 1);
      });
      assert.equal(service.pending['test-key'].length, 1);

      service.call({count: 2}, 'test-key', function(err, output) {
        assert.equal(service.pending['test-key'].length, 0);

        assert.isNull(err);
        assert.equal(output, 1);
      });
      assert.equal(service.pending['test-key'].length, 2);

      service.call({count: 3}, 'test-key', function(err, output) {
        assert.equal(service.pending['test-key'].length, 0);
        assert.isNull(err);
        assert.equal(output, 1);
        service.call({count: 4}, 'test-key', function(err, output) {
          assert.equal(service.pending['test-key'].length, 0);
          assert.isNull(err);
          assert.equal(output, 1);

          service.cache.clear();
          service.call({count: 5}, 'test-key', function(err, output) {
            assert.isNull(err);
            assert.equal(output, 5);
            done();
          });
        });
        assert.equal(service.pending['test-key'].length, 1);
      });
      assert.equal(service.pending['test-key'].length, 3);

      assert.isUndefined(service.pending['test-key-2']);
      service.call({count: 6}, 'test-key-2', function(err, output) {
        assert.equal(service.pending['test-key-2'].length, 0);
        assert.isNull(err);
        assert.equal(output, 6);
      });
      assert.equal(service.pending['test-key-2'].length, 1);
    });
  });
});