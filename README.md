# Lead Generation Tool Backend

Backend API for Lead Generation Tool built with Node.js, Express, and MongoDB.

## Project Structure

```
leadGenerationToolBackend/
├── server/
│   └── index.js          # Main server entry point
├── db/
│   └── connection.js     # MongoDB connection configuration
├── .env                  # Environment variables (not tracked in git)
├── .env.example          # Example environment variables
├── .gitignore
└── package.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory (already created with your MongoDB URI):

```
MONGODB_URI=your_mongodb_connection_string
PORT=5000
```

### 3. Run the Application

**Development mode (with auto-restart):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

## API Endpoints

- `GET /` - Health check endpoint

## Technologies Used

- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB ODM
- **dotenv** - Environment variable management

## Database Connection

The database connection is configured in `db/connection.js` and automatically connects when the server starts.
