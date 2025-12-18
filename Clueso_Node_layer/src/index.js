const express = require('express');
const http = require('http');
const cors = require('cors');

const { ServerConfig, Logger } = require('./config');
const apiRoutes = require('./routes');
const recordingRoutes = require('./routes/v1/recording-routes');
const pythonRoutes = require('./routes/v1/python-routes');
const { FrontendService, HealthService } = require('./services');
const {
    correlationIdMiddleware,
    errorHandler,
    notFoundHandler
} = require('./middlewares/error-handler');
const { rateLimiter } = require('./middlewares/rate-limiter');

const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO for frontend communication
FrontendService.initialize(httpServer);

// ===== Global Middlewares =====

// Correlation ID for request tracking
app.use(correlationIdMiddleware());

// Enable CORS for all routes
app.use(cors());

// Request metrics tracking
app.use(HealthService.metricsMiddleware());

// Global rate limiter (100 req/min per IP)
app.use(rateLimiter({ windowMs: 60000, max: 100 }));

// ===== Static Files =====

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Serve static files from recordings directory
app.use('/recordings', express.static('recordings'));
app.use('/recordings', express.static('src/recordings'));

// ===== Routes =====

// Recording routes MUST come BEFORE global body parsers
app.use('/api/recording', recordingRoutes);

// Python AI processing routes
app.use('/api/python', pythonRoutes);

// Body parsers for other APIs
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// All other API routes (includes sessions, health, batch)
app.use('/api', apiRoutes);

// ===== Error Handling =====

// 404 handler
app.use(notFoundHandler());

// Global error handler (must be last)
app.use(errorHandler());

// ===== Start Server =====

httpServer.listen(ServerConfig.PORT, () => {
    console.log(`Successfully started server on PORT ${ServerConfig.PORT}`);
    Logger.info("Server started");
    Logger.info("Socket.IO server ready for frontend connections");
    Logger.info("New features enabled: Rate Limiting, Validation, Sessions, Health, Error Handling, Batch Processing");
});