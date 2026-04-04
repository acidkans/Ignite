const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const subtasks = await prisma.subtask.findMany({
    select: { name: true }
  });
  console.log(subtasks);
}
main().catch(console.error).finally(() => prisma.$disconnect());
