'use strict';

var assert = require('./utils').assert;
var Func = require('../lib/Func');

describe('Func', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(Func);
    });
    it('should accept an object and initialise properly', function() {
      var echo = function() {};
      var func = new Func('echo', echo);
      assert.equal(func.name, 'echo');
      assert.strictEqual(func.handler, echo);
    });
  });
  describe('#name', function() {
    it('should be validated', function() {
      new Func('test', function() {});
      assert.throws(
        function() {
          new Func();
        },
        '"undefined" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func(undefined);
        },
        '"undefined" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func(null);
        },
        '"null" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func(false);
        },
        '"false" is not a valid function name'
      );
      assert.throws(
        function() {
          new Func('');
        },
        '"" is not a valid function name'
      );
    });
  });
  describe('#handler', function() {
    it('should be validated', function() {
      new Func('test', function() {});
      assert.throws(
        function() {
          new Func('test');
        },
        'Function handlers must be functions'
      );
      assert.throws(
        function() {
          new Func('test', {});
        },
        'Function handlers must be functions'
      );
    });
  });
  describe('#call()', function() {
    it('the handler should be provided with a this context, data, and a callback', function(done) {
      var context = {};
      var data = {};

      var func = new Func('test', function(_data, cb) {
        assert.strictEqual(this, context);
        assert.strictEqual(_data, data);
        assert.isFunction(cb);
        done();
      });

      func.call(context, data, function(){});
    });
    it('should convert all function output to strings', function(done) {
      var object = new Func('test', function(data, cb) {
        cb(null, {foo: [20]});
      });

      var number = new Func('test', function(data, cb) {
        cb(null, 10);
      });

      object.call(null, null, function(err, output) {
        assert.isNull(err);
        assert.equal(output, JSON.stringify({foo: [20]}));
        number.call(null, null, function(err, output) {
          assert.isNull(err);
          assert.equal(output, '10');
          done();
        });
      });
    });
    it('should produce errors if the output is falsey', function(done) {
      var _null = new Func('test', function(data, cb) {
        cb(null, null);
      });

      var _undefined = new Func('test', function(data, cb) {
        cb(null, undefined);
      });

      var _false = new Func('test', function(data, cb) {
        cb(null, false);
      });

      var emptyString = new Func('test', function(data, cb) {
        cb(null, '');
      });

      _null.call(null, null, function(err, output) {
        assert.instanceOf(err, Error);
        assert.isUndefined(output);
        _undefined.call(null, null, function(err, output) {
          assert.instanceOf(err, Error);
          assert.isUndefined(output);
          _false.call(null, null, function(err, output) {
            assert.instanceOf(err, Error);
            assert.isUndefined(output);
            emptyString.call(null, null, function(err, output) {
              assert.instanceOf(err, Error);
              assert.isUndefined(output);
              done();
            });
          });
        });
      });
    });
    it('can complete asynchronously', function(done) {
      var func = new Func('test', function(data, cb) {
        setTimeout(function() {
          cb(null, 'delayed success');
        }, 10);
      });
      func.call(null, null, function(err, output) {
        assert.isNull(err);
        assert.equal(output, 'delayed success');
        done();
      });
    });
  });
});