module.exports = function(data, cb) {
  if (data.echo === undefined) {
    return cb('`echo` data not provided');
  }
  cb(null, data.echo);
};
