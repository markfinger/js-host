var assert = require('chai').assert;
var path = require('path');
var request = require('request');
var DevService = require('../lib/DevService');

describe('DevService', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(DevService);
    });
    it('should accept an object and initialise properly', function() {
      var obj = {
        name: 'echo',
        handler: function() {}
      };
      var service = new DevService(obj);
      assert.equal(service.name, 'echo');
      assert.strictEqual(service.handler, obj.handler);
    });
  });
  describe('#getHandlerContext', function() {
    it('should add a host prop', function() {
      var service = new DevService({name: 'test', handler: function() {}});
      service.host = 'foo';
      assert.equal(service.getHandlerContext().host, 'foo');
    });
  });
});