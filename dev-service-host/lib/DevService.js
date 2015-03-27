var _ = require('lodash');
var Service = require('../../lib/Service');

var DevService = function DevService(obj) {
  Service.call(this, obj);
};

DevService.prototype = _.assign({}, Service.prototype);

DevService.prototype.getHandlerContext = function getHandlerContext() {
  var context = Service.prototype.getHandlerContext.call(this);
  context.host = this.host;
  return context;
};

module.exports = DevService;