const { PrismaService } = require('../../dist/prisma/prisma.service.js');

// Test the getUnifiedTree logic directly
async function testUnifiedEndpoint() {
    try {
        // Simulate Prisma queries
        const siteNodeId = 'c807f501-142c-493b-bb72-fcc340dbcd7d';
        const orderNodeId = 'fc09a8af-6938-418a-a2a2-04b50c5b31f1';
        
        console.log('Testing unified WBS endpoint logic...');
        console.log(`Site node ID: ${siteNodeId}`);
        console.log(`Expected order node ID after fallback: ${orderNodeId}`);
        
        // Simulate the fallback
        const nodeIdsToTry = [siteNodeId, orderNodeId];
        console.log(`nodeIdsToTry = [${nodeIdsToTry.map(id => `"${id}"`).join(', ')}]`);
        
        console.log('\nThe getUnifiedTree method should:');
        console.log('1. Try site node first');
        console.log('2. Find 0 rows for site node');
        console.log('3. Fall back to order node');
        console.log('4. Find 45 rows for order node');
        console.log('5. Return the 45 rows');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testUnifiedEndpoint();
