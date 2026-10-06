# Full-Stack eCommerce Platform

A production-oriented, marketplace-ready full-stack eCommerce starter built from a real storefront architecture and generalized for reuse.

The project keeps the polished storefront, cart, authentication, checkout, admin and fulfillment flows of the original production codebase while removing brand-specific and QR-specific business logic.

## Features

- Responsive TypeScript + Vite storefront
- Node.js + Express API
- Firebase Authentication and Firestore
- Guest and authenticated carts
- Product catalog, variants, colors, stock and reviews
- Inventory reservation during cart and checkout
- Email/password and Google authentication
- Email verification and password reset
- Home-delivery checkout
- Viva.com Smart Checkout integration
- Customer orders and returns
- Admin products, orders, fulfillment, customers and contact inbox
- Transactional email flows with Resend
- English / Greek localization architecture
- SEO product pages, structured data and sitemap
- Security middleware, rate limits, CSRF protections and CI checks
- Demo catalog and neutral marketplace assets

## Structure

```
client/   Storefront, account pages, checkout and admin UI
server/   Express API, Firestore services, payments and business logic
```

## Quick start

### 1. Client

```bash
cd client
cp .env.example .env
npm ci
npm run dev
```

### 2. Server

```bash
cd server
cp .env.example .env
npm ci
npm run dev
```

Configure Firebase and the optional payment/email integrations in the two `.env` files.

The storefront defaults to **NovaStore** as a neutral demo brand. Change `VITE_STORE_NAME`, `VITE_STORE_TAGLINE`, store URLs and support email without editing application code.

## Demo catalog

Run the product seed after Firebase is configured:

```bash
cd server
npm run seed:products
```

The included catalog contains generic apparel and accessory products intended only for demonstration.

## Build

```bash
cd client
npm run build
```

Product prerendering is opportunistic: a production catalog API improves generated SEO HTML, but a first-time build still succeeds when the API is not running.

## Marketplace preparation status

The `productize` branch is the active cleanup branch. It is being validated before promotion to `main`.

Before distributing commercially, replace demo content, configure your own payment/email providers, review your jurisdiction-specific legal pages, and set production secrets outside the repository.
