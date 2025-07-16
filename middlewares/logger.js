const logger = (req, res, next) => {
    if (process.env.NODE_ENV === 'production') return next();
  
    const start = Date.now();
    console.log(`📥 ${req.method} ${req.originalUrl}`);
  
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('📦 Request Body:', req.body);
    }
  
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`📤 ${res.statusCode} ${res.statusMessage} - ${duration}ms`);
    });
  
    next();
  };
  
  module.exports = logger;
  