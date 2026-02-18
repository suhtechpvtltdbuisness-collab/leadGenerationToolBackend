require("dotenv").config();
const express = require("express");
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
