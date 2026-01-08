const mongoose = require('mongoose');

async function migrateAuthLogs() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('🔄 Connected to database\n');

    // Find all authentication logs in activitylogs collection
    const activityLogs = await mongoose.connection.db
      .collection('activitylogs')
      .find({ eventType: { $in: ['login', 'logout'] } })
      .toArray();

    console.log('Found', activityLogs.length, 'authentication logs to migrate\n');

    if (activityLogs.length > 0) {
      // Transform to new access log format
      const accessLogs = activityLogs.map(log => ({
        userId: log.userId,
        userName: log.userName,
        userEmail: log.userEmail,
        action: log.eventType === 'login' ? 'login' : 'logout',
        success: log.status === 'success',
        failureReason: log.status !== 'success' ? log.details : undefined,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        projectName: log.metadata?.brandName,
        role: log.metadata?.role,
        timestamp: log.timestamp,
        metadata: log.metadata,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt
      }));

      // Insert into accesslogs collection
      await mongoose.connection.db.collection('accesslogs').insertMany(accessLogs);
      console.log('✅ Migrated', accessLogs.length, 'logs to accesslogs collection');

      // Delete old authentication logs from activitylogs
      const deleteResult = await mongoose.connection.db
        .collection('activitylogs')
        .deleteMany({ eventType: { $in: ['login', 'logout'] } });
      console.log('✅ Deleted', deleteResult.deletedCount, 'old authentication logs from activitylogs\n');
    }

    // Show final counts
    const activityCount = await mongoose.connection.db.collection('activitylogs').countDocuments();
    const accessCount = await mongoose.connection.db.collection('accesslogs').countDocuments();
    
    console.log('📊 Final counts:');
    console.log('  Activity Logs:', activityCount);
    console.log('  Access Logs:', accessCount);

    await mongoose.connection.close();
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateAuthLogs();
