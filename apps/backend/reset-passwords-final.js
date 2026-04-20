const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();
async function main() {
  const password = '123456';
  const hashedPassword = await argon2.hash(password);
  
  const users = await prisma.user.findMany({ select: { email: true } });
  console.log('Users in DB:', users.map(u => u.email).join(', '));

  for (const email of ['a@poz.pl', 'admin@poz.pl']) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword }
      });
      console.log(`✅ Password reset for: ${email}`);
    } else {
      console.log(`❌ User not found: ${email}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
