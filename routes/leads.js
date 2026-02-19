const express = require("express");
const router = express.Router();
const { getDb } = require("../db/connection");
const { validateLead } = require("../models/lead");

// POST /api/leads - Create single or multiple leads
router.post("/", async (req, res) => {
  console.log("📥 Received POST request to /api/leads");
  try {
    const db = await getDb();
    const leadsCollection = db.collection("leads");

    // Handle both single lead and array of leads
    const leadsData = Array.isArray(req.body) ? req.body : [req.body];

    if (leadsData.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one lead is required",
      });
    }

    const validatedLeads = leadsData.map((lead) => validateLead(lead));
    const result = await leadsCollection.insertMany(validatedLeads);

    res.status(201).json({
      success: true,
      message: `${result.insertedCount} lead(s) stored successfully`,
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds,
    });
  } catch (error) {
    console.error("Error storing lead:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/leads - Get all leads
router.get("/", async (req, res) => {
  console.log("📤 Received GET request to /api/leads");
  try {
    const db = await getDb();
    const leadsCollection = db.collection("leads");

    // Fetch all leads, sorted by latest created
    const leads = await leadsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: leads.length,
      leads: leads,
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch leads",
    });
  }
});

module.exports = router;
