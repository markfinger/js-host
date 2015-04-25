'use strict';

var assert = require('chai').assert;
var Func = require('../lib/Func');

describe('Func', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Func);
    });
    it('should accept an object and initialise properly', function() {
      var obj = {
        name: 'echo',
        handler: function() {},
        cacheTimeout: null
      };
      var func = new Func(obj);
      assert.equal(func.name, 'echo');
      assert.strictEqual(func.handler, obj.handler);
    });
  });
  describe('#name', function() {
    it('should be validated', function() {
      new Func({
        name: 'test', handler: function() {}, cacheTimeout: null
      });
      assert.throws(
        function() {
          new Func({});
        },
        '"undefined" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func({name: undefined});
        },
        '"undefined" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func({name: null});
        },
        '"null" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func({name: false});
        },
        '"false" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func({name: ''});
        },
        '"" is not a valid function name'
      );
    });
  });
  describe('#handler', function() {
    it('should be validated', function() {
      new Func({
        name: 'test', handler: function() {}, cacheTimeout: null
      });
      assert.throws(
        function() {
          new Func({name: 'test'});
        },
        'Function handlers must be functions'
      );
      assert.throws(
        function() {
          new Func({name: 'test', handler: {}});
        },
        'Function handlers must be functions'
      );
    });
  });
  describe('#call()', function() {
    it('the output of functions can be cached', function(done) {
      var func = new Func({
        name: 'test',
        handler: function(data, cb) {
          setTimeout(function() {
            cb(null, data.count);
          }, 10);
        },
        cacheTimeout: null
      });

      assert.equal(func.cache.get('test-key'), null);

      func.call({count: 1}, 'test-key', function(err, output) {
        assert.isNull(err);
        assert.equal(output, 1);
        assert.equal(func.cache.get('test-key'), 1);

        func.call({count: 2}, 'test-key', function(err, output) {
          assert.isNull(err);
          assert.equal(output, 1);

          func.cache.set('test-key', 3);

          func.call({count: 4}, 'test-key', function(err, output) {
            assert.isNull(err);
            assert.equal(output, 3);

            func.call({count: 4}, 'another-test-key', function(err, output) {
              assert.isNull(err);
              assert.equal(output, 4);
              done();
            });
          });
        });
      });
    });
    it('the handler should be provided with a context', function(done) {
      var func = new Func({
        name: 'test',
        host: 'foo host',
        handler: function() {
          assert.notStrictEqual(this, func);
          assert.notStrictEqual(this, global);
          assert.isObject(this);
          assert.equal(this.name, 'test');
          assert.equal(this.host, 'foo host');
          done();
        },
        cacheTimeout: null
      });
      func.call();
    });
    it('if a cache key is defined, successive calls to a function will block until the first completes', function(done) {
      var func = new Func({
        name: 'test',
        handler: function(data, cb) {
          setTimeout(function() {
            cb(null, data.count);
          }, 25);
        },
        cacheTimeout: null
      });

      assert.equal(func.cache.get('test-key'), null);
      assert.isUndefined(func.pending['test-key']);

      func.call({count: 1}, 'test-key', function(err, output) {
        assert.equal(func.pending['test-key'].length, 0);

        assert.isNull(err);
        assert.equal(output, 1);
        assert.equal(func.cache.get('test-key'), 1);
      });
      assert.equal(func.pending['test-key'].length, 1);

      func.call({count: 2}, 'test-key', function(err, output) {
        assert.equal(func.pending['test-key'].length, 0);

        assert.isNull(err);
        assert.equal(output, 1);
      });
      assert.equal(func.pending['test-key'].length, 2);

      func.call({count: 3}, 'test-key', function(err, output) {
        assert.equal(func.pending['test-key'].length, 0);
        assert.isNull(err);
        assert.equal(output, 1);
        func.call({count: 4}, 'test-key', function(err, output) {
          assert.equal(func.pending['test-key'].length, 0);
          assert.isNull(err);
          assert.equal(output, 1);

          func.cache.clear();
          func.call({count: 5}, 'test-key', function(err, output) {
            assert.isNull(err);
            assert.equal(output, 5);
            done();
          });
        });
        assert.equal(func.pending['test-key'].length, 1);
      });
      assert.equal(func.pending['test-key'].length, 3);

      assert.isUndefined(func.pending['test-key-2']);
      func.call({count: 6}, 'test-key-2', function(err, output) {
        assert.equal(func.pending['test-key-2'].length, 0);
        assert.isNull(err);
        assert.equal(output, 6);
      });
      assert.equal(func.pending['test-key-2'].length, 1);
    });
    it('should convert all function output to strings', function(done) {
      var object = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, {foo: [20]});
        },
        cacheTimeout: null
      });

      var number = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, 10);
        },
        cacheTimeout: null
      });

      object.call({}, function(err, output) {
        assert.isNull(err);
        assert.equal(output, JSON.stringify({foo: [20]}));
        number.call({}, function(err, output) {
          assert.isNull(err);
          assert.equal(output, '10');
          done();
        });
      });
    });
    it('should produce errors if the output is falsey', function(done) {
      var _null = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, null);
        },
        cacheTimeout: null
      });

      var _undefined = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, undefined);
        },
        cacheTimeout: null
      });

      var _false = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, false);
        },
        cacheTimeout: null
      });

      var emptyString = new Func({
        name: 'test',
        handler: function(data, cb) {
          cb(null, '');
        },
        cacheTimeout: null
      });

      _null.call({}, function(err, output) {
        assert.instanceOf(err, Error);
        assert.isUndefined(output);
        _undefined.call({}, function(err, output) {
          assert.instanceOf(err, Error);
          assert.isUndefined(output);
          _false.call({}, function(err, output) {
            assert.instanceOf(err, Error);
            assert.isUndefined(output);
            emptyString.call({}, function(err, output) {
              assert.instanceOf(err, Error);
              assert.isUndefined(output);
              done();
            });
          });
        });
      });
    });
  });
});