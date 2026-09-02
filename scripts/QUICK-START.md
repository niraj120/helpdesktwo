# Quick Start: Import Production Database

Since you **don't have SSH access** or direct MongoDB connection, follow these steps:

## Step 1: Request Backup from Team

Send this message to someone with server access:

```
Hi, I need a MongoDB backup of the production database.

Please run this on the server (34.14.157.13):

wget https://raw.githubusercontent.com/your-repo/server-export-db.sh
chmod +x server-export-db.sh
./server-export-db.sh

Or manually:
mongodump --uri="mongodb://<user>:<password>@localhost:27017/sac_helpdesk?authSource=admin" --out=/tmp/mongodb-backup
cd /tmp && tar -czf sac_helpdesk-backup.tar.gz mongodb-backup/

Then share the file: /tmp/sac_helpdesk-backup-*.tar.gz
```

Alternatively, attach [scripts/server-export-db.sh](./server-export-db.sh) and ask them to run it.

## Step 2: Download the Backup File

Place the received `.tar.gz` file in the `mongodb-backup` folder:

```powershell
# Create folder if it doesn't exist
mkdir mongodb-backup -ErrorAction SilentlyContinue

# Move the downloaded file
Move-Item "Downloads\sac_helpdesk-backup-*.tar.gz" ".\mongodb-backup\"
```

## Step 3: Ensure MongoDB Tools are Installed

```powershell
# Check if installed
mongorestore --version

# If not installed, install via Chocolatey:
choco install mongodb-database-tools

# Or download from:
# https://www.mongodb.com/try/download/database-tools
```

## Step 4: Ensure Local MongoDB is Running

```powershell
# Start MongoDB service
net start MongoDB

# Or check if it's running
Get-Service MongoDB

# Test connection
mongosh mongodb://localhost:27017
```

If MongoDB is not installed locally, install it:
```powershell
choco install mongodb
```

## Step 5: Import the Backup

```powershell
# Simple - script will find the backup automatically
.\scripts\import-from-backup.ps1

# Or specify the file directly
.\scripts\import-from-backup.ps1 -BackupPath ".\mongodb-backup\sac_helpdesk-backup-20231225.tar.gz"
```

The script will:
- Automatically extract the `.tar.gz` file
- Import all collections
- Overwrite local database (you'll be asked to confirm)

## Step 6: Update Backend Configuration

After import, update `backend\.env` to use local database:

```env
# Use local MongoDB
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk
NODE_ENV=development
```

## Step 7: Verify Import

Connect with MongoDB Compass:
```
mongodb://localhost:27017/sac_helpdesk
```

Or check via command line:
```powershell
mongosh mongodb://localhost:27017/sac_helpdesk
```

```javascript
// List all collections
show collections

// Check counts
db.users.countDocuments()
db.tickets.countDocuments()
db.projects.countDocuments()

// Sample a document
db.users.findOne()
```

## Troubleshooting

### "MongoDB Tools not found"
Install them: `choco install mongodb-database-tools`

### "Local MongoDB not running"
Start it: `net start MongoDB`

### "Extraction failed"
Windows 10+ has built-in tar. If it fails, install 7-Zip:
```powershell
choco install 7zip
# Then manually extract the .tar.gz file
```

### "Import overwrites data"
The script asks for confirmation. Type `yes` to proceed.

### Need to re-import
Just run the script again with the same backup file.

## Alternative: Sample Data Script

If you just need sample data for development (not actual production data), we can create a seed script instead.

Let me know if you need that!
