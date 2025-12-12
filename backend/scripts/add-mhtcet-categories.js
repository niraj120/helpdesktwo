const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  console.log('✅ Connected to MongoDB');
  
  const db = client.db('sac_helpdesk');
  const projectId = new ObjectId('6938f34bedea0c244850566d');
  
  const categories = [
    {
      projectId: projectId,
      name: 'Technical Issue',
      description: 'Technical problems or issues',
      color: '#3B82F6',
      icon: 'ComputerDesktopIcon',
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      projectId: projectId,
      name: 'Account Related',
      description: 'Account access or credentials issues',
      color: '#8B5CF6',
      icon: 'UserIcon',
      order: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      projectId: projectId,
      name: 'Site not working',
      description: 'Website or portal not accessible',
      color: '#EF4444',
      icon: 'ExclamationTriangleIcon',
      order: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      projectId: projectId,
      name: 'General Query',
      description: 'General questions or information requests',
      color: '#10B981',
      icon: 'QuestionMarkCircleIcon',
      order: 4,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      projectId: projectId,
      name: 'Admission Related',
      description: 'Admission process or documentation queries',
      color: '#F59E0B',
      icon: 'AcademicCapIcon',
      order: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      projectId: projectId,
      name: 'Payment Issue',
      description: 'Payment or fee related problems',
      color: '#EC4899',
      icon: 'CreditCardIcon',
      order: 6,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  const result = await db.collection('categories').insertMany(categories);
  console.log(`✅ Inserted ${result.insertedCount} categories for MHTCET project`);
  
  console.log('\n📋 Categories created:');
  categories.forEach((cat, idx) => {
    console.log(`  ${idx + 1}. ${cat.name}`);
  });
  
  await client.close();
})();
