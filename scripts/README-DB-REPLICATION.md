# MongoDB Database Replication Guide

This guide helps you replicate production MongoDB data to your local environment.

## Prerequisites

1. **MongoDB installed locally** and running
2. **MongoDB Database Tools** installed
   - Download from: https://www.mongodb.com/try/download/database-tools
   - Or via Chocolatey: `choco install mongodb-database-tools`

## Method 1: Direct Export/Import (if you have network access)

### Option A: With SSH Tunnel (Recommended)

If production server blocks direct connections:

1. **Set up SSH tunnel** (in a separate terminal):
   ```powershell
   ssh -L 27018:34.14.157.13:27017 your-username@jump-server-ip
   ```
   Keep this terminal open!

2. **Run export script with SSH parameters**:
   ```powershell
   .\scripts\export-production-db.ps1 -SSHUser "your-username" -SSHHost "jump-server-ip"
   ```

### Option B: Direct Connection

If your IP is whitelisted:

```powershell
.\scripts\export-production-db.ps1
```

## Method 2: Import Existing Backup

If you have a backup file or someone provided a dump:

```powershell
.\scripts\import-from-backup.ps1 -BackupPath "path\to\backup\folder"
```

## Method 3: Manual Export/Import

### On Production Server (via SSH):

```bash
# Export
mongodump --uri="mongodb://<user>:<password>@localhost:27017/sac_helpdesk?authSource=admin" --out=/tmp/db-backup

# Compress
cd /tmp
tar -czf db-backup.tar.gz db-backup/

# Download to your local machine
# On your local machine (separate terminal):
scp user@server:/tmp/db-backup.tar.gz ./mongodb-backup/
```

### On Your Local Machine:

```powershell
# Extract backup
tar -xzf mongodb-backup\db-backup.tar.gz -C mongodb-backup\

# Import
.\scripts\import-from-backup.ps1 -BackupPath "mongodb-backup\db-backup"
```

## Troubleshooting

### MongoDB Tools Not Found

Install MongoDB Database Tools:
```powershell
# Via Chocolatey
choco install mongodb-database-tools

# Or download from
# https://www.mongodb.com/try/download/database-tools
```

### Local MongoDB Not Running

Start MongoDB:
```powershell
# As a service
net start MongoDB

# Or manually
mongod --dbpath=C:\data\db
```

### Connection Timeout

1. Check if server is reachable:
   ```powershell
   Test-NetConnection -ComputerName 34.14.157.13 -Port 27017
   ```

2. If blocked, use SSH tunnel (Method 1, Option A)

3. Ask admin to whitelist your IP address

### Import Errors

- Ensure local MongoDB is running
- Check disk space
- Verify backup files are not corrupted
- Try without `--drop` flag if you want to merge data

## Update .env File

After importing, update your backend `.env` file:

```env
# Use local database
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk

# Or explicitly set
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk
NODE_ENV=development
```

## Verify Import

Connect with MongoDB Compass:
```
mongodb://localhost:27017/sac_helpdesk
```

Or check via CLI:
```powershell
mongosh mongodb://localhost:27017/sac_helpdesk
```

```javascript
// Show collections
show collections

// Count documents in a collection
db.users.countDocuments()
db.tickets.countDocuments()
```

## Security Note

⚠️ **Never commit production credentials to git!**

The backup files contain production data. Keep them secure and add to `.gitignore`:
```
mongodb-backup/
*.dump
*.bson
```
