const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

(async () => {
    const email = 'andrzej@gigatel.app';
    const password = 'password123';
    const hashed = await argon2.hash(password);
    const user = await prisma.user.update({
        where: { email },
        data: { password: hashed },
    }).catch(() => null);
    if (!user) {
        console.error(`User ${email} not found`);
        process.exit(1);
    }
    console.log(`Password reset for ${user.email} -> ${password}`);
    await prisma.$disconnect();
})();
