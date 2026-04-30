
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subdomain = 'aksesuar';
  const newName = 'Aksesuar Dünyası';
  
  const company = await prisma.company.findFirst({
    where: { 
      OR: [
        { subdomain: subdomain },
        { subdomain: subdomain.toUpperCase() }
      ]
    }
  });

  if (company) {
    console.log(`Found company: ${company.name} (${company.subdomain})`);
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { name: newName }
    });
    console.log(`Updated company name to: ${updated.name}`);
  } else {
    console.log(`Company with subdomain ${subdomain} not found.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
