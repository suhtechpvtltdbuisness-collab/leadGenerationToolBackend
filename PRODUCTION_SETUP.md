# Production Database Setup Guide

## Common Issues in Production

### 1. IP Whitelist in MongoDB Atlas

Make sure your production server's IP address is whitelisted in MongoDB Atlas:

- Go to MongoDB Atlas Dashboard
- Navigate to Network Access
- Add your production server's IP address
- Or use `0.0.0.0/0` to allow all IPs (less secure)

### 2. Environment Variables

Ensure `MONGODB_URI` is properly set in production:

```bash
# Check if env variable is set (don't print the actual value)
echo ${MONGODB_URI:0:20}...
```

### 3. Connection String Format

Your MongoDB URI should include the database name:

```
mongodb+srv://username:password@cluster.mongodb.net/databaseName?retryWrites=true&w=majority
```

### 4. Network/Firewall Settings

- Ensure your production server can reach `*.mongodb.net` on port 27017
- Check if there are any firewall rules blocking outbound connections

### 5. MongoDB Atlas User Permissions

- Verify the database user has proper read/write permissions
- Check if the password contains special characters that need URL encoding

## Testing Connection in Production

1. **Check environment variables:**

```bash
node -e "require('dotenv').config(); console.log('URI exists:', !!process.env.MONGODB_URI);"
```

2. **Test connection directly:**

```bash
node -e "require('dotenv').config(); const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('Connected!')).catch(err => console.error(err));"
```

3. **Use the health check endpoint:**

```bash
curl http://your-domain.com/api/db-status
```

## Connection Timeout Settings

The connection now includes these settings:

- `serverSelectionTimeoutMS: 30000` - 30 seconds to find a server
- `socketTimeoutMS: 45000` - 45 seconds of socket inactivity
- `maxPoolSize: 10` - Maximum 10 concurrent connections

## Deployment Checklist

- [ ] MongoDB Atlas IP whitelist configured
- [ ] Environment variables set in production
- [ ] Database user created with proper permissions
- [ ] Network connectivity tested
- [ ] Application logs checked for connection errors
- [ ] `/api/db-status` endpoint returns success: true
