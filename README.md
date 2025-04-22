# share_in_backend

An Express.js backend with authentication and file sharing capabilities.

## Features

- User authentication (signup, signin, token refresh)
- File upload with JWT token authentication
- File access control with user-based permissions
- File type detection and thumbnail generation
- Fuzzy search and filtering of files
- Scheduled file deletion

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   DB_URL=your_mongodb_connection_string
   PORT=3000
   JWT_SECRET=your_secret_key
   REFRESH_TOKEN_SECRET=your_refresh_secret
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create a new user
- `POST /api/auth/signin` - Login and get JWT token
- `POST /api/auth/refresh-token` - Refresh an expired token
- `GET /api/auth/profile/:uid` - Get user profile

### File Operations

- `POST /api/files/upload` - Upload a file (requires JWT token)
- `GET /api/files` - Get user's files (with optional filters)
- `GET /api/files/:id` - Get a specific file by ID
- `PUT /api/files/:id/access` - Update file access permissions
- `DELETE /api/files/:id` - Delete a file

## File Models

Files include the following metadata:
- `name` - File name
- `fileUrl` - URL to access the file
- `access` - Array of user IDs with access permission
- `creator` - User ID of file creator
- `createdAt` - Upload timestamp
- `scheduledDeleteDate` - Optional date for automatic deletion
- `type` - File type (docs, sheets, media, other)
- `previewImage` - URL to thumbnail (if available)