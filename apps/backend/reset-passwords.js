const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();
async function main() {
  const password = '123456';
  const hashedPassword = await argon2.hash(password);
  
  const user = await prisma.user.update({
    where: { email: 'a@poz.pl' },
    data: { password: hashedPassword }
  });
  
  const admin = await prisma.user.update({
    where: { email: 'admin@poz.pl' },
    data: { password: hashedPassword }
  });

  console.log('✅ Passwords for a@poz.pl and admin@poz.pl reset to: 123456');
}
main().catch(console.error).finally(() => prisma.$disconnect());
