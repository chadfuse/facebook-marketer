const { getDatabase, saveDatabase } = require('../services/storage');
const { generatePostContent, FRAMEWORKS } = require('../services/gemini');

async function runVerification() {
  console.log('🧪 Starting Automated System Verification...\n');

  // Test 1: Storage & Niches
  console.log('Test 1: Storage & Initial Niches...');
  const db = getDatabase();
  if (!db || !Array.isArray(db.niches) || db.niches.length === 0) {
    throw new Error('Database failed to initialize default niches');
  }
  console.log(`✅ Database loaded successfully with ${db.niches.length} target niches.`);

  // Test 2: AI Post Generation across all frameworks
  console.log('\nTest 2: Testing Post Generation across 4 Marketing Frameworks...');
  const sampleNiche = db.niches[0]; // "HVAC Company New York"

  for (const [key, framework] of Object.entries(FRAMEWORKS)) {
    const posts = await generatePostContent({
      nicheName: sampleNiche.name,
      industry: sampleNiche.industry,
      location: sampleNiche.location,
      specificAngle: sampleNiche.specificAngle,
      framework: key,
      portfolioUrl: 'https://myportfolio.dev',
      variationCount: 1
    });

    if (!posts || posts.length === 0 || typeof posts[0] !== 'string') {
      throw new Error(`Framework ${key} failed to produce valid copy`);
    }
    console.log(`✅ [${framework.name}] Generated ${posts[0].length} chars of copy.`);
  }

  console.log('\n🎉 All core services passed verification successfully!\n');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
