This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Base de datos (Supabase)

El SQL vive en `supabase/`. Orden de ejecución en el editor SQL de Supabase:

1. `schema.sql` (esquema base)
2. `migration_dashboard.sql`
3. `migration_stock.sql`
4. `migration_financing.sql`
5. `migration_push.sql`
6. `migration_recontacto.sql` (agrega `recontactado_agente_at`)
7. `migration_analytics.sql` (usa la columna anterior)
8. `migration_multitenant.sql` (crea `tenants` y agrega `tenant_id`)
9. `migration_stock_alerts.sql` (alertas de stock; depende de `tenants` y `leads`)

Opcionales para datos de demo: `seed_vehicles.sql`, `seed_demo_leads.sql` y
`refresh_demo_data.sql` (regenera los leads demo sin tocar los reales).

Para validar todas las migraciones localmente contra Postgres (WASM):

```bash
npx tsx scripts/validar-sql.ts
```

