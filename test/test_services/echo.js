module.exports = function(done, data) {
	if (data.echo === undefined) {
		return done('`echo` data not provided');
	}
	done(null, data.echo);
};
