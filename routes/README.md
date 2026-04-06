# API Routes Documentation

## Leads Routes (`/api/leads`)

### POST /api/leads

Create one or multiple leads.

**Request Body (Single Lead):**

```json
{
  "name": "Hospital Name",
  "rating": "4.5 stars",
  "address": "123 Main St",
  "phoneNumber": "+1234567890",
  "websiteLink": "https://example.com"
}
```

**Request Body (Multiple Leads):**

```json
[
  {
    "name": "Hospital 1",
    "rating": "4.5 stars",
    "address": "123 Main St"
  },
  {
    "name": "Hospital 2",
    "rating": "4.8 stars",
    "address": "456 Oak Ave"
  }
]
```

**Response:**

```json
{
  "success": true,
  "message": "2 lead(s) stored successfully",
  "insertedCount": 2,
  "insertedIds": {
    "0": "...",
    "1": "..."
  }
}
```

### GET /api/leads

Get all leads, sorted by most recent.

**Response:**

```json
{
  "success": true,
  "count": 10,
  "leads": [
    {
      "_id": "...",
      "name": "Hospital Name",
      "rating": "4.5 stars",
      "address": "123 Main St",
      "phoneNumber": "+1234567890",
      "websiteLink": "https://example.com",
      "createdAt": "2026-02-19T...",
      "updatedAt": "2026-02-19T..."
    }
  ]
}
```

## Search Routes (`/api/search-hospitals`)

### GET /api/search-hospitals

Search for hospitals/businesses using Google Maps.

**Query Parameters:**

- `query` (required): Search term (e.g., "hospitals in New York")
- `limit` (optional, default: 20): Maximum number of results
- `offset` (optional, default: 0): Starting index for pagination

**Example:**

```
GET /api/search-hospitals?query=hospitals in Boston&limit=10&offset=0
```

**Response:**

```json
{
  "success": true,
  "count": 10,
  "query": "hospitals in Boston",
  "results": [
    {
      "name": "Hospital Name",
      "rating": "4.5 stars",
      "address": "123 Main St, Boston, MA",
      "phoneNumber": "(123) 456-7890",
      "websiteLink": "https://example.com"
    }
  ]
}
```

## Tasks Routes (`/api/tasks`)

### POST /api/tasks

Create one or many tasks.

**Request Body (Single Task):**

```json
{
  "title": "Kick-off call with Innovate Corp",
  "assignee": "Sarah Chen",
  "phone": "(555) 987-6543",
  "email": "sarah.chen@innovatecorp.com",
  "source": "LinkedIn Ad",
  "dueDate": "2026-06-04",
  "status": "To Do",
  "priority": "High",
  "notes": "Prepare project scope questions"
}
```

### GET /api/tasks

Get paginated tasks with optional filtering/sorting.

**Query Params (all optional):**

- `page` (default: `1`)
- `limit` (default: `10`, max: `100`)
- `status` (`To Do`, `In Progress`, `Done`)
- `priority` (`High`, `Medium`, `Low`)
- `source` (exact match)
- `search` (matches title, assignee, phone, email, source)
- `dueDateFrom` (ISO date)
- `dueDateTo` (ISO date)
- `sortBy` (`title`, `assignee`, `dueDate`, `status`, `priority`, `createdAt`, `updatedAt`)
- `sortOrder` (`asc` or `desc`)

### GET /api/tasks/:id

Get a single task by ID.

### PATCH /api/tasks/:id

Partially update a task by ID.

### DELETE /api/tasks/:id

Delete one task by ID.

### PATCH /api/tasks/bulk-status

Update status for multiple tasks.

**Request Body:**

```json
{
  "ids": ["id1", "id2"],
  "status": "Done"
}
```

### DELETE /api/tasks

Delete multiple tasks by IDs.

**Request Body:**

```json
{
  "ids": ["id1", "id2"]
}
```

## Health Check Routes

### GET /api/db-status

Check database connection status.

**Response (Connected):**

```json
{
  "success": true,
  "status": "connected",
  "message": "Database connection is active",
  "host": "leadgen.umvikma.mongodb.net",
  "database": "database_name"
}
```

### GET /

API health check.

**Response:**

```json
{
  "message": "Lead Generation Tool API"
}
```

## Notes

- All timestamps are stored in ISO 8601 format
- The `name` field is required for all leads
- Other fields (rating, address, phoneNumber, websiteLink) are optional
- The search endpoint uses Puppeteer for web scraping and may take longer to respond
- For production deployment with search functionality, consider using `@sparticuz/chromium` for serverless environments
