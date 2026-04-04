const fs = require('fs');
const iconv = require('iconv-lite');

function checkEncoding(filePath) {
    const buffer = fs.readFileSync(filePath);
    const encodings = ['utf8', 'win1250', 'iso-8859-2'];
    
    encodings.forEach(enc => {
        const decoded = iconv.decode(buffer, enc);
        if (decoded.includes('monitorów') || decoded.includes('ośmiu') || decoded.includes('dwóch')) {
            console.log(`✅ MATCH FOUND WITH ENCODING: ${enc}`);
            fs.writeFileSync('local_dump_fixed.sql', iconv.encode(decoded, 'utf8'));
            process.exit(0);
        }
    });
    console.log('❌ No match found with common encodings.');
}

const path = 'c:/Users/Andrzej/.gemini/antigravity/scratch/ERP/local_dump.sql';
// First installment: check if we have iconv-lite
try {
    require('iconv-lite');
    checkEncoding(path);
} catch (e) {
    console.log('iconv-lite not found, installing...');
    const cp = require('child_process');
    cp.execSync('npm install iconv-lite', { cwd: 'c:/Users/Andrzej/.gemini/antigravity/scratch/ERP/apps/backend' });
    const iconv2 = require('c:/Users/Andrzej/.gemini/antigravity/scratch/ERP/apps/backend/node_modules/iconv-lite');
    const buffer = fs.readFileSync(path);
    ['utf8', 'win1250', 'iso-8859-2'].forEach(enc => {
        const decoded = iconv2.decode(buffer, enc);
        if (decoded.includes('monitorów') || decoded.includes('ośmiu') || decoded.includes('dwóch')) {
            console.log(`✅ MATCH FOUND WITH ENCODING: ${enc}`);
            fs.writeFileSync('c:/Users/Andrzej/.gemini/antigravity/scratch/ERP/local_dump_fixed.sql', iconv2.encode(decoded, 'utf8'));
            process.exit(0);
        }
    });
}
