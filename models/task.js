const VALID_STATUSES = ["To Do", "In Progress", "Done"];
const VALID_PRIORITIES = ["High", "Medium", "Low"];

const normalizeString = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeStatus = (value) => {
  if (!value) return "To Do";

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "todo" || normalized === "to do") return "To Do";
  if (normalized === "in progress" || normalized === "inprogress") {
    return "In Progress";
  }
  if (normalized === "done") return "Done";

  throw new Error(
    `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`,
  );
};

const normalizePriority = (value) => {
  if (!value) return "Medium";

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";

  throw new Error(
    `Invalid priority. Allowed values: ${VALID_PRIORITIES.join(", ")}`,
  );
};

const normalizeDate = (value, fieldName) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return date;
};

const validateTask = (taskData = {}) => {
  const title = normalizeString(taskData.title || taskData.name);

  if (!title) {
    throw new Error("Task title is required");
  }

  const now = new Date();

  return {
    title,
    assignee: normalizeString(taskData.assignee),
    phone: normalizeString(taskData.phone),
    email: normalizeString(taskData.email),
    source: normalizeString(taskData.source),
    dueDate: normalizeDate(taskData.dueDate, "dueDate"),
    status: normalizeStatus(taskData.status),
    priority: normalizePriority(taskData.priority),
    notes: normalizeString(taskData.notes),
    createdAt: now,
    updatedAt: now,
  };
};

const validateTaskUpdate = (taskData = {}) => {
  const updateDoc = {};

  if (Object.prototype.hasOwnProperty.call(taskData, "title") ||
      Object.prototype.hasOwnProperty.call(taskData, "name")) {
    const title = normalizeString(taskData.title || taskData.name);
    if (!title) throw new Error("Task title cannot be empty");
    updateDoc.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "assignee")) {
    updateDoc.assignee = normalizeString(taskData.assignee);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "phone")) {
    updateDoc.phone = normalizeString(taskData.phone);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "email")) {
    updateDoc.email = normalizeString(taskData.email);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "source")) {
    updateDoc.source = normalizeString(taskData.source);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "dueDate")) {
    updateDoc.dueDate = normalizeDate(taskData.dueDate, "dueDate");
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "status")) {
    updateDoc.status = normalizeStatus(taskData.status);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "priority")) {
    updateDoc.priority = normalizePriority(taskData.priority);
  }

  if (Object.prototype.hasOwnProperty.call(taskData, "notes")) {
    updateDoc.notes = normalizeString(taskData.notes);
  }

  if (Object.keys(updateDoc).length === 0) {
    throw new Error("No valid fields provided for update");
  }

  updateDoc.updatedAt = new Date();
  return updateDoc;
};

module.exports = {
  validateTask,
  validateTaskUpdate,
  VALID_STATUSES,
  VALID_PRIORITIES,
};
