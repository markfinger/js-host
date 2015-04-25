module.exports = function(data, done) {
  if (data.echo === undefined) {
    return done('`echo` data not provided');
  }
  done(null, data.echo);
};
