const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.count();
  const nodes = await prisma.processNode.count();
  const subtasks = await prisma.subtask.count();
  const schematics = await prisma.schematicDocument.count();
  console.log({ users, nodes, subtasks, schematics });
}
main().catch(console.error).finally(() => prisma.$disconnect());
