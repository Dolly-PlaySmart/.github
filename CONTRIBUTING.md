# Contributing

## Naming a new repo

### The rules

1. **All lowercase, kebab-case** — no PascalCase, no mixed-case, no underscores.
2. **Product prefix first** — one of: `thrillz-ios-`, `thrillz-android-`, `thrillz-` (cross-platform), `yardz-`, `playsmart-`, `studio-`, `shared-`, `template-`.
3. **Role/type last** — `-api`, `-app`, `-sdk`, `-cdn`, `-site`, `-bot`, `-infra`, `-worker`, `-scheduler`, `-cms`, `-migration`, etc.
4. **Short, factual, no cute names** — `thrillz-ios-api` not `ApiThrillz` or `flyingThrillzBackend`.

### Valid examples

- `thrillz-ios-api`
- `thrillz-android-unity-core`
- `yardz-cdn`
- `playsmart-api`
- `studio-website`
- `shared-directus-cms`
- `template-unity-match3`

### Invalid examples

- `ApiThrillz` → PascalCase, product at end
- `Unity-Core-Project` → not kebab-case, unclear product, role unclear
- `Smart-Play` / `PlaySmart-API` → inconsistent naming for same product
