module.exports = function(data, cb) {
  setTimeout(function() {
    if (data.echo === undefined) {
      return cb(new Error('`echo` data not provided'));
    }
    cb(null, data.echo);
  }, 25);
};
