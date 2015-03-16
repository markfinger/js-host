var path = require('path');
var Service = require('../lib/Service');
var assert = require('chai').assert;

var pathToEcho = path.join(__dirname, 'test_services', 'echo');
var pathToUndefined = path.join(__dirname, 'test_services', 'undefined');
var pathToEchoAsync = path.join(__dirname, 'test_services', 'echo_async');

describe('Service', function() {
	describe('constructor', function() {
		it('should be a function', function() {
			assert.isFunction(Service);
		});
	});
    describe('config', function() {
        it('the constructor should accept a config object and initialise properly', function() {
            var config = {
                name: 'echo',
                pathToSource: pathToEcho
            };
            var service = new Service(config);
            assert.deepEqual(service.config, config);
            assert.equal(service.name, 'echo');
            assert.strictEqual(service.handler, require('./test_services/echo'));
        });
    });
    describe('name', function() {
        it('should be validated', function() {
            new Service({
                name: 'test', pathToSource: pathToEcho
            });
            assert.throws(
                function() { new Service({pathToSource: pathToEcho}); },
                '"undefined" is not a valid service name'
            );
            assert.throws(
                function() { new Service({name: undefined, pathToSource: pathToEcho}); },
                '"undefined" is not a valid service name'
            );
            assert.throws(
                function() { new Service({name: null, pathToSource: pathToEcho}); },
                '"null" is not a valid service name'
            );
            assert.throws(
                function() { new Service({name: false, pathToSource: pathToEcho}); },
                '"false" is not a valid service name'
            );
            assert.throws(
                function() { new Service({name: '', pathToSource: pathToEcho}); },
                '"" is not a valid service name'
            );
        });
    });
	describe('handler', function() {
        it('should be validated', function() {
            assert.throws(
                function() { new Service({name: 'test', pathToSource: pathToUndefined}); },
                '"' + pathToUndefined + '" does not export a function'
            );
        });
		it('should accept done and data arguments', function() {
			var service = new Service({
                name: 'test',
				pathToSource: pathToEcho
			});

			service.handler(function(err, output) {
				assert.equal(err, '`echo` data not provided');
				assert.isUndefined(output);
			}, {});

			service.handler(function(err, output) {
				assert.isNull(err);
				assert.equal(output, 'test');
			}, {echo: 'test'});
		});
        it('done can be evaluated asynchronously', function(done) {
            var service = new Service({
                name: 'test',
                pathToSource: pathToEchoAsync
            });

            var error = false;
            var success = false;

            service.handler(function(err, output) {
                assert.equal(err, '`echo` data not provided');
                assert.isUndefined(output);
                error = true;
                success && done();
            }, {});

            service.handler(function(err, output) {
                assert.isNull(err);
                assert.equal(output, 'test');
                success = true;
                error && done();
            }, {echo: 'test'});
        });
	});
});