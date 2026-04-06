const express = require("express");
const mongoose = require("mongoose");
const { getDb } = require("../db/connection");
const {
  validateTask,
  validateTaskUpdate,
  VALID_STATUSES,
  VALID_PRIORITIES,
} = require("../models/task");

const router = express.Router();

// POST /api/tasks - Create one or many tasks
router.post("/", async (req, res) => {
  try {
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const incomingTasks = Array.isArray(req.body) ? req.body : [req.body];

    if (incomingTasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one task is required",
      });
    }

    const validatedTasks = incomingTasks.map((task) => validateTask(task));
    const result = await tasksCollection.insertMany(validatedTasks);

    return res.status(201).json({
      success: true,
      message: `${result.insertedCount} task(s) created successfully`,
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/tasks - List tasks with pagination, filtering, and sorting
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      const requestedStatus = String(req.query.status).trim();
      if (!VALID_STATUSES.includes(requestedStatus)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status filter. Allowed values: ${VALID_STATUSES.join(
            ", ",
          )}`,
        });
      }
      filter.status = requestedStatus;
    }

    if (req.query.priority) {
      const requestedPriority = String(req.query.priority).trim();
      if (!VALID_PRIORITIES.includes(requestedPriority)) {
        return res.status(400).json({
          success: false,
          error: `Invalid priority filter. Allowed values: ${VALID_PRIORITIES.join(
            ", ",
          )}`,
        });
      }
      filter.priority = requestedPriority;
    }

    if (req.query.source) {
      filter.source = String(req.query.source).trim();
    }

    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search !== "") {
        filter.$or = [
          { title: { $regex: search, $options: "i" } },
          { assignee: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { source: { $regex: search, $options: "i" } },
        ];
      }
    }

    if (req.query.dueDateFrom || req.query.dueDateTo) {
      filter.dueDate = {};

      if (req.query.dueDateFrom) {
        const dueDateFrom = new Date(req.query.dueDateFrom);
        if (Number.isNaN(dueDateFrom.getTime())) {
          return res.status(400).json({
            success: false,
            error: "Invalid dueDateFrom value",
          });
        }
        filter.dueDate.$gte = dueDateFrom;
      }

      if (req.query.dueDateTo) {
        const dueDateTo = new Date(req.query.dueDateTo);
        if (Number.isNaN(dueDateTo.getTime())) {
          return res.status(400).json({
            success: false,
            error: "Invalid dueDateTo value",
          });
        }
        filter.dueDate.$lte = dueDateTo;
      }
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase();
    const allowedSortFields = [
      "title",
      "assignee",
      "dueDate",
      "status",
      "priority",
      "createdAt",
      "updatedAt",
    ];

    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sortBy value. Allowed values: ${allowedSortFields.join(
          ", ",
        )}`,
      });
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({
        success: false,
        error: "sortOrder must be either 'asc' or 'desc'",
      });
    }

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [tasks, total] = await Promise.all([
      tasksCollection.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      tasksCollection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      tasks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch tasks",
    });
  }
});

// PATCH /api/tasks/bulk-status - Update status for many tasks
router.patch("/bulk-status", async (req, res) => {
  const { ids, status } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Request body must contain a non-empty 'ids' array",
    });
  }

  if (!status) {
    return res.status(400).json({
      success: false,
      error: "status is required",
    });
  }

  const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Invalid ID format: ${invalidIds.join(", ")}`,
    });
  }

  try {
    const updateDoc = validateTaskUpdate({ status });
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const result = await tasksCollection.updateMany(
      { _id: { $in: objectIds } },
      { $set: updateDoc },
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} task(s) updated successfully`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// DELETE /api/tasks - Bulk delete tasks by IDs
router.delete("/", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Request body must contain a non-empty 'ids' array",
    });
  }

  const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Invalid ID format: ${invalidIds.join(", ")}`,
    });
  }

  try {
    const db = await getDb();
    const tasksCollection = db.collection("tasks");
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const result = await tasksCollection.deleteMany({
      _id: { $in: objectIds },
    });

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} task(s) deleted successfully`,
      deletedCount: result.deletedCount,
      requestedCount: ids.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete tasks",
    });
  }
});

// GET /api/tasks/:id - Get one task by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid task ID format",
    });
  }

  try {
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const task = await tasksCollection.findOne({
      _id: new mongoose.Types.ObjectId(id),
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    return res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch task",
    });
  }
});

// PATCH /api/tasks/:id - Partially update a task
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid task ID format",
    });
  }

  try {
    const updateDoc = validateTaskUpdate(req.body);
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const result = await tasksCollection.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateDoc },
      { returnDocument: "after" },
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: result.value,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// DELETE /api/tasks/:id - Delete one task by ID
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid task ID format",
    });
  }

  try {
    const db = await getDb();
    const tasksCollection = db.collection("tasks");

    const result = await tasksCollection.deleteOne({
      _id: new mongoose.Types.ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete task",
    });
  }
});

module.exports = router;
