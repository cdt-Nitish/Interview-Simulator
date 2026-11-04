// Authentication middleware using session
function isAuthenticated(req, res, next) {
  if (req.session && req.session.isLoggedIn && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // For API / AJAX requests
  if (
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))
  ) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  // For regular browser page visits
  return res.redirect('/login');
}

module.exports = isAuthenticated;
