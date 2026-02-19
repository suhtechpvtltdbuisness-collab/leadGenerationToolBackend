require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("../db/connection");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Lead Generation Tool API" });
});

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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
