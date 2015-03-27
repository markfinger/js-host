var assert = require('chai').assert;
var path = require('path');
var request = require('request');
var DevHost = require('../lib/DevHost');
var DevService = require('../lib/DevService');

describe('DevHost', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(DevHost);
    });
    it('should instantiate with properties set correctly', function() {
      var host = new DevHost();
      assert.isObject(host.config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.deepEqual(host.config, host.defaultConfig);
      assert.isObject(host.services);
    });
    it('the constructor should accept a config', function() {
      var config = {};
      var host = new DevHost(config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.strictEqual(host.config, config);
      assert.deepEqual(host.config, host.defaultConfig);
    });
  });
  describe('#Service', function() {
    it('the prototype\'s prop should be DevService', function() {
      assert.strictEqual(DevHost.prototype.Service, DevService);
    });
    it('an instance\'s prop should be DevService', function() {
      assert.strictEqual(new DevHost().Service, DevService);
    });
    it('created services should have a `host` prop bound', function() {
      var host = new DevHost();
      host.addService({name: 'echo', handler: function(){}});
      assert.strictEqual(host.services.echo.host, host);
    });
  });
  describe('#getServiceLookupMiddleware()', function() {
    it('Failed service lookups respond with a list of available services', function(done) {
      var host = new DevHost({
        outputOnListen: false
      });

      host.addService({
        name: 'service1',
        handler: function(data, done) {}
      });
      host.addService({
        name: 'service2',
        handler: function(data, done) {}
      });

      host.listen(function() {
        request.post('http://127.0.0.1:63578/', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          assert.include(res.body.toLowerCase(), 'services available');
          assert.include(res.body, 'service1');
          assert.include(res.body, 'service2');
          host.stopListening();
          done();
        });
      });
    });
  });
  describe('__hotload', function() {
    it('is added on startup', function() {
      var host = new DevHost();
      assert.isDefined(host.services.__hotload);
    });
    it('can hot load new services', function(done) {
      var host = new DevHost();

      host.callService(
        '__hotload',
        {
          services: [
            {
              name: 'echo',
              file: path.join(__dirname, 'test_services', 'echo.js')
            },
            {
              name: 'echo-async',
              file: path.join(__dirname, 'test_services', 'echo_async.js')
            }
          ]
        },
        function(err, output) {
          assert.isNull(err);
          assert.equal(output, 'Success');
        }
      );

      assert.isDefined(host.services.echo);
      assert.isDefined(host.services['echo-async']);

      host.callService('echo', {echo: 'test1'}, function(err, output) {
        assert.equal(output, 'test1');
      });

      host.callService('echo-async', {echo: 'test2'}, function(err, output) {
        assert.equal(output, 'test2');
        done();
      });
    });
    it('can hot load new services via the network', function(done) {
      var host = new DevHost({
        outputOnListen: false
      });

      var services = [
        {
          name: 'echo',
          file: path.join(__dirname, 'test_services', 'echo.js')
        },
        {
          name: 'echo-async',
          file: path.join(__dirname, 'test_services', 'echo_async.js')
        }
      ];

      host.listen(function() {
        request.post({url: host.getUrl(), headers: {'X-SERVICE': '__hotload'}, json: true, body: {services: services}}, function(err, res, body) {
          assert.equal(body, 'Success');
          request.post({url: host.getUrl(), headers: {'X-SERVICE': 'echo'}, json: true, body: {echo: 'test1'}}, function(err, res, body) {
            assert.equal(body, 'test1');
            request.post({url: host.getUrl(), headers: {'X-SERVICE': 'echo-async'}, json: true, body: {echo: 'test2'}}, function(err, res, body) {
              assert.equal(body, 'test2');
              host.stopListening();
              done();
            });
          });
        });
      });
    });
  });
});