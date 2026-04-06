require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { connectDB } = require("../db/connection");

// Import routes
const leadsRoutes = require("../routes/leads");
const searchRoutes = require("../routes/search");
const tasksRoutes = require("../routes/tasks");

const app = express();
const PORT = process.env.PORT || 5000;
const isServerless =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// CORS Middleware - BEFORE other middleware and routes
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Local development
      "http://localhost:5174",
      "http://127.0.0.1:5001/", // Alternative port
      "https://lead-generation-tool-backend.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  }),
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Lead Generation Tool API" });
});

// API Routes
app.use("/api/leads", leadsRoutes);
app.use("/api/search-hospitals", searchRoutes);
app.use("/api/tasks", tasksRoutes);

// Database connection status route
app.get("/api/db-status", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  if (dbStatus === 1) {
    res.status(200).json({
      success: true,
      status: statusMap[dbStatus],
      message: "Database connection is active",
      host: mongoose.connection.host,
      database: mongoose.connection.name,
    });
  } else {
    res.status(503).json({
      success: false,
      status: statusMap[dbStatus] || "unknown",
      message: "Database connection is not active",
    });
  }
});

// Initialize server with database connection
const startServer = async () => {
  try {
    // Wait for database connection before starting server
    await connectDB();

    // Start server only after DB is connected
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

if (isServerless) {
  // In serverless runtimes, avoid calling app.listen and just pre-warm DB.
  connectDB().catch((error) => {
    console.error("Serverless DB pre-warm failed:", error.message);
  });
} else {
  // Start the server in traditional runtime.
  startServer();
}

module.exports = app;
