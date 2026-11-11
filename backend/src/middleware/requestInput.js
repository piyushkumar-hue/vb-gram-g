function rejectUnknownQueryParams(allowed = []) {
  return (request, response, next) => {
    const unsupported = Object.keys(request.query || {}).find((field) => !allowed.includes(field));
    if (unsupported) {
      return response.status(400).json({ message: 'Request contains an unsupported query parameter.' });
    }
    return next();
  };
}

module.exports = { rejectUnknownQueryParams };
