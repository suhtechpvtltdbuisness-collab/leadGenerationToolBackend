require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { connectDB } = require("../db/connection");

// Import routes
const leadsRoutes = require("../routes/leads");
const searchRoutes = require("../routes/search");

const app = express();
const PORT = process.env.PORT || 5000;

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

// Start the server
startServer();

module.exports = app;
